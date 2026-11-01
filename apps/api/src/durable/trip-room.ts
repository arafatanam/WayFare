import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

interface Attachment {
  userId: string;
  name: string;
}

/**
 * One instance per trip. Holds hibernatable WebSockets for everyone viewing the trip, relays change
 * events (clients refetch), and tracks presence. State lives in the DB; this object only coordinates.
 */
export class TripRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const event = await request.text();
      this.send(event);
      return new Response("ok");
    }

    if (request.headers.get("Upgrade") === "websocket") {
      // The Worker authenticates and authorizes before forwarding; identity arrives via headers.
      const userId = request.headers.get("X-User-Id");
      const name = request.headers.get("X-User-Name") ?? "Someone";
      if (!userId) return new Response("unauthorized", { status: 401 });
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ userId, name } satisfies Attachment);
      this.sendPresence();
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket) {
    ws.close();
    this.sendPresence();
  }

  async webSocketError() {
    this.sendPresence();
  }

  private sendPresence() {
    const seen = new Map<string, string>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && ws.readyState === WebSocket.OPEN) seen.set(a.userId, a.name);
    }
    this.send(JSON.stringify({ type: "presence", users: [...seen].map(([userId, name]) => ({ userId, name })) }));
  }

  private send(data: string) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        /* socket closing */
      }
    }
  }
}
