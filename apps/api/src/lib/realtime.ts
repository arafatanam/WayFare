import type { Env } from "../env";

export type RoomEvent =
  | { type: "trip.updated" }
  | { type: "itinerary.updated" }
  | { type: "places.updated" }
  | { type: "members.updated" }
  | { type: "proposal.updated"; proposalId: string; status: string };

/** Tells everyone connected to a trip room that something changed; clients refetch. */
export async function broadcast(env: Env, tripId: string, event: RoomEvent, actorId?: string) {
  try {
    const stub = env.TRIP_ROOM.get(env.TRIP_ROOM.idFromName(tripId));
    await stub.fetch("https://room/broadcast", { method: "POST", body: JSON.stringify({ ...event, actorId }) });
  } catch (e) {
    console.error("broadcast failed", e);
  }
}
