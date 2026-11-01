import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { keys } from "./queries";

export interface PresenceUser {
  userId: string;
  name: string;
}

/**
 * Subscribes to a trip's Durable Object room. Change events invalidate cached queries so every
 * collaborator sees edits within a moment; presence shows who else is viewing.
 */
export function useTripLive(tripId: string | undefined) {
  const qc = useQueryClient();
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!tripId) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let ping: ReturnType<typeof setInterval> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/trips/${tripId}/live`);
      ws.onopen = () => {
        retry = 0;
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
      };
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "presence") return setPresence(msg.users);
          if (msg.type === "proposal.updated") qc.invalidateQueries({ queryKey: keys.proposal(tripId) });
          else qc.invalidateQueries({ queryKey: keys.trip(tripId) });
          if (msg.type === "trip.updated") qc.invalidateQueries({ queryKey: keys.trips });
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (closed) return;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      closed = true;
      clearInterval(ping);
      clearTimeout(timer);
      ws?.close();
    };
  }, [tripId, qc]);

  return presence;
}
