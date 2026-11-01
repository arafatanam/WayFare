import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type {
  AppNotification,
  Collection,
  GeoResult,
  ImportJob,
  Invite,
  ItineraryDay,
  ItineraryProposal,
  Me,
  Member,
  Place,
  PlaceInput,
  PlaceUpdate,
  ShareLink,
  Trip,
} from "@wayfare/shared";
import { toast } from "sonner";
import { del, get, patch, post, put, qs } from "./api";

export type TripPlace = Place & { mustVisit: boolean; addedBy: string | null };
export interface TripDetail {
  trip: Trip;
  places: TripPlace[];
  members: Member[];
  days: ItineraryDay[];
}
export interface HomeData {
  upcomingTrips: Trip[];
  continueTripId: string | null;
  recentPlaces: Place[];
  recentCollections: Collection[];
  pendingImports: ImportJob[];
  counts: { places: number; collections: number; trips: number };
}
export type CollectionDetail = Collection & { places: Place[] };
export type PlaceDetail = Place & { readOnly: boolean };

export const keys = {
  me: ["me"] as const,
  home: ["home"] as const,
  places: (f: object = {}) => ["places", f] as const,
  place: (id: string) => ["place", id] as const,
  collections: ["collections"] as const,
  collection: (id: string) => ["collection", id] as const,
  trips: ["trips"] as const,
  trip: (id: string) => ["trip", id] as const,
  proposal: (tripId: string) => ["proposal", tripId] as const,
  imports: ["imports"] as const,
  importJob: (id: string) => ["import", id] as const,
  notifications: ["notifications"] as const,
  invites: ["invites"] as const,
  tripInvites: (id: string) => ["tripInvites", id] as const,
  shareLinks: (type: string, id: string) => ["shareLinks", type, id] as const,
};

// --- Reads ----------------------------------------------------------------------

/** DEV MODE: true when the API runs with DEV_MODE=true (auth, onboarding and paywalls bypassed). */
export const useDevMode = () =>
  useQuery({ queryKey: ["devMode"], queryFn: () => get<{ devMode?: boolean }>("/health").then((h) => !!h.devMode).catch(() => false), staleTime: Infinity });

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => get<Me>("/me") });
export const useHome = () => useQuery({ queryKey: keys.home, queryFn: () => get<HomeData>("/me/home") });

export interface PlaceFilters {
  q?: string;
  category?: string;
  collectionId?: string;
  tripId?: string;
  city?: string;
  visited?: "true" | "false";
  sort?: "recent" | "oldest" | "name" | "city";
}
export const usePlaces = (f: PlaceFilters = {}) =>
  useQuery({ queryKey: keys.places(f), queryFn: () => get<Place[]>(`/places${qs({ ...f })}`), placeholderData: (prev) => prev });
export const useDestinations = () =>
  useQuery({ queryKey: ["destinations"], queryFn: () => get<{ city: string; country: string | null; count: number }[]>("/places/destinations") });
export const usePlace = (id: string) => useQuery({ queryKey: keys.place(id), queryFn: () => get<PlaceDetail>(`/places/${id}`) });

export const useCollections = () => useQuery({ queryKey: keys.collections, queryFn: () => get<Collection[]>("/collections") });
export const useCollection = (id: string) => useQuery({ queryKey: keys.collection(id), queryFn: () => get<CollectionDetail>(`/collections/${id}`) });

export const useTrips = () => useQuery({ queryKey: keys.trips, queryFn: () => get<Trip[]>("/trips") });
export const useTrip = (id: string) => useQuery({ queryKey: keys.trip(id), queryFn: () => get<TripDetail>(`/trips/${id}`) });

export const useLatestProposal = (tripId: string) =>
  useQuery({
    queryKey: keys.proposal(tripId),
    queryFn: () => get<ItineraryProposal | null>(`/trips/${tripId}/itinerary/proposals/latest`),
    // Poll while generation is running, as a fallback to the realtime channel.
    refetchInterval: (q) => (q.state.data && ["queued", "running"].includes(q.state.data.status) ? 4000 : false),
  });

export const useImports = () => useQuery({ queryKey: keys.imports, queryFn: () => get<ImportJob[]>("/imports") });
export const useImportJob = (id: string | null) =>
  useQuery({
    queryKey: keys.importJob(id ?? ""),
    queryFn: () => get<ImportJob>(`/imports/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && ["queued", "processing"].includes(q.state.data.status) ? 2000 : false),
  });

export const useNotifications = () =>
  useQuery({ queryKey: keys.notifications, queryFn: () => get<AppNotification[]>("/notifications"), refetchInterval: 60_000 });
export const useInvites = () => useQuery({ queryKey: keys.invites, queryFn: () => get<{ emailVerified: boolean; invites: Invite[] }>("/invites") });
export const useTripInvites = (tripId: string, enabled: boolean) =>
  useQuery({ queryKey: keys.tripInvites(tripId), queryFn: () => get<Invite[]>(`/trips/${tripId}/invites`), enabled });
export const useShareLinks = (type: "trip" | "collection", id: string, enabled = true) =>
  useQuery({ queryKey: keys.shareLinks(type, id), queryFn: () => get<ShareLink[]>(`/share-links${qs({ resourceType: type, resourceId: id })}`), enabled });

export const usePlaceSearch = (q: string, near?: { lat: number; lng: number } | null) =>
  useQuery({
    queryKey: ["placeSearch", q, near],
    queryFn: () => get<GeoResult[]>(`/explore/search${qs({ q, lat: near?.lat, lng: near?.lng })}`),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
  });

// --- Writes ---------------------------------------------------------------------

function useInvalidate() {
  const qc = useQueryClient();
  return (...ks: QueryKey[]) => Promise.all(ks.map((k) => qc.invalidateQueries({ queryKey: k })));
}

const onError = (e: Error) => toast.error(e.message);

export function useCreatePlace() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (p: Partial<PlaceInput> & { name: string }) => post<Place>("/places", p),
    onSuccess: () => inv(["places"], keys.home, keys.collections),
    onError,
  });
}

export function useUpdatePlace(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (p: PlaceUpdate) => patch<Place>(`/places/${id}`, p),
    onSuccess: () => inv(["places"], keys.place(id), keys.home, ["trip"], ["collection"]),
    onError,
  });
}

export function useDeletePlace() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => del(`/places/${id}`),
    onSuccess: () => inv(["places"], keys.home, keys.collections, ["collection"], ["trip"]),
    onError,
  });
}

export function useSetPlaceCollections(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (collectionIds: string[]) => put<Place>(`/places/${id}/collections`, { collectionIds }),
    onSuccess: () => inv(["places"], keys.place(id), keys.collections, ["collection"]),
    onError,
  });
}

export function useCreateCollection() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (c: { name: string; description?: string | null; placeIds?: string[]; visibility?: string }) => post<Collection>("/collections", c),
    onSuccess: () => inv(keys.collections, keys.home, ["places"]),
    onError,
  });
}

export function useUpdateCollection(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (c: Partial<{ name: string; description: string | null; coverImageUrl: string | null; visibility: string }>) => patch<Collection>(`/collections/${id}`, c),
    onSuccess: () => inv(keys.collections, keys.collection(id)),
    onError,
  });
}

export function useCreateTrip() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (t: unknown) => post<Trip>("/trips", t), onSuccess: () => inv(keys.trips, keys.home, ["places"]), onError });
}

export function useUpdateTrip(id: string) {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (t: object) => patch<Trip>(`/trips/${id}`, t), onSuccess: () => inv(keys.trip(id), keys.trips, keys.home), onError });
}

export function useAddPlacesToTrip(tripId: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (placeIds: string[]) => post<{ added: number }>(`/trips/${tripId}/places`, { placeIds }),
    onSuccess: () => inv(keys.trip(tripId), ["places"], keys.trips),
    onError,
  });
}

export function useItineraryMutations(tripId: string) {
  const inv = useInvalidate();
  const done = () => inv(keys.trip(tripId));
  const base = `/trips/${tripId}/itinerary`;
  return {
    addItem: useMutation({ mutationFn: (b: object) => post(`${base}/items`, b), onSuccess: done, onError }),
    updateItem: useMutation({ mutationFn: ({ id, ...b }: { id: string } & Record<string, unknown>) => patch(`${base}/items/${id}`, b), onSuccess: done, onError }),
    removeItem: useMutation({ mutationFn: (id: string) => del(`${base}/items/${id}`), onSuccess: done, onError }),
    reorder: useMutation({ mutationFn: (b: { dayId: string; itemIds: string[] }) => put(`${base}/order`, b), onSettled: done, onError }),
    updateDay: useMutation({ mutationFn: ({ id, ...b }: { id: string; title?: string | null; notes?: string | null }) => patch(`${base}/days/${id}`, b), onSuccess: done, onError }),
    generate: useMutation({
      mutationFn: (b: { scope: "trip" | "day"; dayId?: string; instructions?: string }) => post<ItineraryProposal>(`${base}/generate`, b),
      onSuccess: () => inv(keys.proposal(tripId), keys.me),
      onError,
    }),
    accept: useMutation({ mutationFn: (id: string) => post(`${base}/proposals/${id}/accept`), onSuccess: () => inv(keys.trip(tripId), keys.proposal(tripId), ["places"]), onError }),
    discard: useMutation({ mutationFn: (id: string) => post(`${base}/proposals/${id}/discard`), onSuccess: () => inv(keys.proposal(tripId)), onError }),
  };
}

export function useMarkNotificationsRead() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (ids?: string[]) => post("/notifications/read", { ids }), onSuccess: () => inv(keys.notifications) });
}

export function useUpdateProfile() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (b: object) => patch("/me/profile", b), onSuccess: () => inv(keys.me), onError });
}
