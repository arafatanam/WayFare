import {
  tripPhase,
  tripPreferences,
  type Collection,
  type ImportJob,
  type ItineraryDay,
  type ItineraryItem,
  type Place,
  type PlaceCategory,
  type SourcePlatform,
  type TravelLeg,
  type Trip,
  type TripRole,
} from "@wayfare/shared";
import type { schema } from "../db";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toPlace(p: Row<typeof schema.places>, extra: { collectionIds?: string[]; tripIds?: string[] } = {}): Place {
  return {
    ...p,
    category: p.category as PlaceCategory,
    sourcePlatform: p.sourcePlatform as SourcePlatform,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    ...extra,
  };
}

export function toCollection(c: Row<typeof schema.collections>, stats: { placeCount: number; previewImages: string[] }): Collection {
  return {
    id: c.id,
    ownerId: c.ownerId,
    name: c.name,
    description: c.description,
    coverImageUrl: c.coverImageUrl,
    visibility: c.visibility as Collection["visibility"],
    placeCount: stats.placeCount,
    previewImages: stats.previewImages,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    lastOpenedAt: iso(c.lastOpenedAt),
  };
}

export function toTrip(t: Row<typeof schema.trips>, extra: { role: TripRole; placeCount: number; memberCount: number }): Trip {
  return {
    id: t.id,
    ownerId: t.ownerId,
    name: t.name,
    destination: t.destination,
    destinationLat: t.destinationLat,
    destinationLng: t.destinationLng,
    extraDestinations: t.extraDestinations ?? [],
    startDate: t.startDate,
    endDate: t.endDate,
    coverImageUrl: t.coverImageUrl,
    status: t.status as Trip["status"],
    phase: tripPhase(t),
    visibility: t.visibility as Trip["visibility"],
    preferences: tripPreferences.parse(t.preferences ?? {}),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    ...extra,
  };
}

export function toItineraryItem(i: Row<typeof schema.itineraryItems>, place: Row<typeof schema.places> | null | undefined): ItineraryItem {
  return {
    id: i.id,
    dayId: i.dayId,
    placeId: i.placeId,
    place: place
      ? { id: place.id, name: place.name, lat: place.lat, lng: place.lng, category: place.category as PlaceCategory, imageUrl: place.imageUrl, address: place.address, city: place.city }
      : null,
    title: i.title,
    startTime: i.startTime,
    durationMinutes: i.durationMinutes,
    notes: i.notes,
    position: i.position,
    aiGenerated: i.aiGenerated,
    travelToNext: (i.travelToNext as TravelLeg | null) ?? null,
  };
}

export function toDay(d: Row<typeof schema.itineraryDays>, items: ItineraryItem[]): ItineraryDay {
  return { id: d.id, tripId: d.tripId, dayNumber: d.dayNumber, date: d.date, title: d.title, notes: d.notes, warnings: d.warnings ?? [], items };
}

export function toImport(i: Row<typeof schema.imports>): ImportJob {
  return {
    id: i.id,
    type: i.type as ImportJob["type"],
    input: i.type === "screenshot" ? "Screenshot" : i.input,
    platform: i.platform as SourcePlatform,
    status: i.status as ImportJob["status"],
    title: i.title,
    caption: i.caption,
    imageUrl: i.imageUrl,
    candidates: (i.candidates ?? []) as ImportJob["candidates"],
    error: i.error,
    createdAt: i.createdAt.toISOString(),
  };
}
