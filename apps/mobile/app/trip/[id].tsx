import type { ItineraryDay, ItineraryProposal, Member, Place, Trip } from "@wayfare/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { API_URL, del, get, post, put } from "@/api";
import { Button, Card, Chip, colors, Cover, emoji, Loading, s } from "@/ui";

interface TripDetail {
  trip: Trip;
  places: (Place & { mustVisit: boolean })[];
  members: Member[];
  days: ItineraryDay[];
}

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [dayIdx, setDayIdx] = useState(0);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["trip", id], queryFn: () => get<TripDetail>(`/trips/${id}`) });
  const { data: proposal, refetch: refetchProposal } = useQuery({
    queryKey: ["proposal", id],
    queryFn: () => get<ItineraryProposal | null>(`/trips/${id}/itinerary/proposals/latest`),
    refetchInterval: (q) => (q.state.data && ["queued", "running"].includes(q.state.data.status) ? 4000 : false),
  });

  useLiveRefresh(id, () => {
    refetch();
    refetchProposal();
  });

  if (isLoading || !data) return <Loading />;
  const { trip, days, places } = data;
  const day = days[Math.min(dayIdx, days.length - 1)];
  const canEdit = trip.role !== "viewer" && trip.status !== "archived";
  const base = `/trips/${id}/itinerary`;

  const reorder = async (from: number, to: number) => {
    const ids = day.items.map((i) => i.id);
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    await put(`${base}/order`, { dayId: day.id, itemIds: ids });
    refetch();
  };

  const generate = async (scope: "trip" | "day") => {
    try {
      await post(`${base}/generate`, { scope, dayId: scope === "day" ? day.id : undefined });
      refetchProposal();
    } catch (e) {
      Alert.alert("Couldn't start", (e as Error).message);
    }
  };

  const addStop = () => {
    const scheduled = new Set(days.flatMap((d) => d.items.map((i) => i.placeId)));
    const options = places.filter((p) => !scheduled.has(p.id)).slice(0, 8);
    if (!options.length) return Alert.alert("All places are scheduled", "Add more places to this trip from your library.");
    Alert.alert(`Add to day ${day.dayNumber}`, undefined, [
      ...options.map((p) => ({
        text: p.name,
        onPress: async () => {
          await post(`${base}/items`, { dayId: day.id, placeId: p.id });
          refetch();
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const located = day?.items.filter((i) => i.place?.lat != null) ?? [];

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: trip.name }} />
      <Cover uri={trip.coverImageUrl} emoji="✈️" style={{ height: 140 }} />
      <View style={s.pad}>
        <Text style={s.h1}>{trip.name}</Text>
        <Text style={s.muted}>
          {trip.destination} · {trip.startDate} → {trip.endDate} · {data.members.length} traveler{data.members.length > 1 ? "s" : ""}
        </Text>

        {proposal && ["queued", "running", "ready", "failed"].includes(proposal.status) && (
          <Card style={{ backgroundColor: proposal.status === "failed" ? "#fffbeb" : colors.brandSoft, gap: 8 }}>
            <Text style={{ fontWeight: "600" }}>
              {proposal.status === "ready"
                ? "✨ A suggested itinerary is ready"
                : proposal.status === "failed"
                  ? proposal.error ?? "Generation failed. Your itinerary is unchanged."
                  : "Building your itinerary…"}
            </Text>
            {proposal.status === "ready" && canEdit && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  title="Use this plan"
                  style={{ flex: 1 }}
                  onPress={() =>
                    Alert.alert("Replace current plan?", proposal.scope === "trip" ? "This replaces the activities on every day." : `This replaces day ${proposal.dayNumber}.`, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Replace",
                        onPress: async () => {
                          await post(`${base}/proposals/${proposal.id}/accept`);
                          refetch();
                          refetchProposal();
                        },
                      },
                    ])
                  }
                />
                <Button
                  title="Discard"
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    await post(`${base}/proposals/${proposal.id}/discard`);
                    refetchProposal();
                  }}
                />
              </View>
            )}
            {proposal.status === "ready" &&
              proposal.days.map((d) => (
                <Text key={d.dayNumber} style={s.muted}>
                  Day {d.dayNumber}: {d.items.map((i) => places.find((p) => p.id === i.placeId)?.name ?? i.candidate?.name ?? i.title).join(" → ")}
                </Text>
              ))}
          </Card>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {days.map((d, i) => (
            <Chip key={d.id} label={`Day ${d.dayNumber} · ${d.date.slice(5)}`} active={i === dayIdx} onPress={() => setDayIdx(i)} />
          ))}
        </ScrollView>

        {day && (
          <>
            <Text style={s.h2}>{day.title ?? `Day ${day.dayNumber}`}</Text>
            {day.warnings.map((w, i) => (
              <Text key={i} style={{ color: "#92400e", fontSize: 12 }}>
                ⚠ {w}
              </Text>
            ))}
            {located.length > 0 && (
              <MapView
                style={{ height: 200, borderRadius: 16 }}
                initialRegion={{ latitude: located[0].place!.lat!, longitude: located[0].place!.lng!, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
              >
                {located.map((i, n) => (
                  <Marker key={i.id} coordinate={{ latitude: i.place!.lat!, longitude: i.place!.lng! }} title={`${n + 1}. ${i.place!.name}`} />
                ))}
                <Polyline coordinates={located.map((i) => ({ latitude: i.place!.lat!, longitude: i.place!.lng! }))} strokeColor={colors.brand} strokeWidth={3} />
              </MapView>
            )}
            {day.items.length === 0 && <Text style={s.muted}>Nothing planned for this day yet.</Text>}
            {day.items.map((it, idx) => (
              <View key={it.id}>
                <Card style={s.row}>
                  <Text style={{ width: 22, fontWeight: "700", color: colors.brand }}>{idx + 1}</Text>
                  <Pressable style={{ flex: 1 }} onPress={() => it.place && router.push(`/place/${it.place.id}`)}>
                    <Text style={{ fontWeight: "600" }}>
                      {it.place ? `${emoji(it.place.category)} ${it.place.name}` : it.title}
                    </Text>
                    <Text style={s.muted}>{[it.startTime, it.durationMinutes ? `${it.durationMinutes} min` : null].filter(Boolean).join(" · ")}</Text>
                    {it.notes && <Text style={{ fontSize: 13, marginTop: 2 }}>{it.notes}</Text>}
                  </Pressable>
                  {canEdit && (
                    <View style={{ gap: 4 }}>
                      <Pressable accessibilityLabel="Move earlier" disabled={idx === 0} onPress={() => reorder(idx, idx - 1)} hitSlop={6}>
                        <Text style={{ opacity: idx === 0 ? 0.3 : 1 }}>▲</Text>
                      </Pressable>
                      <Pressable accessibilityLabel="Move later" disabled={idx === day.items.length - 1} onPress={() => reorder(idx, idx + 1)} hitSlop={6}>
                        <Text style={{ opacity: idx === day.items.length - 1 ? 0.3 : 1 }}>▼</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Remove"
                        hitSlop={6}
                        onPress={async () => {
                          await del(`${base}/items/${it.id}`);
                          refetch();
                        }}
                      >
                        <Text style={{ color: colors.danger }}>✕</Text>
                      </Pressable>
                    </View>
                  )}
                </Card>
                {it.travelToNext && idx < day.items.length - 1 && (
                  <Text style={[s.muted, { marginLeft: 34, marginVertical: 4 }]}>
                    {it.travelToNext.source === "estimate" ? "~" : ""}
                    {it.travelToNext.minutes} min {it.travelToNext.mode} · {it.travelToNext.distanceKm} km
                  </Text>
                )}
              </View>
            ))}
            {canEdit && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button title="+ Add stop" variant="secondary" onPress={addStop} style={{ flex: 1 }} />
                <Button title="✨ Plan this day" variant="secondary" onPress={() => generate("day")} style={{ flex: 1 }} />
              </View>
            )}
            {canEdit && <Button title="✨ Generate whole itinerary" onPress={() => generate("trip")} />}
            <Text style={s.muted}>Times marked “~” are estimates. Check opening hours before you go.</Text>
          </>
        )}

        <Button
          title="Share trip link"
          variant="secondary"
          onPress={async () => {
            if (trip.role !== "owner") return Alert.alert("Only the owner can share this trip");
            const link = await post<{ token: string }>("/share-links", { resourceType: "trip", resourceId: trip.id });
            const { Share } = await import("react-native");
            Share.share({ message: `${trip.name}: ${API_URL}/s/${link.token}` });
            qc.invalidateQueries({ queryKey: ["trip", id] });
          }}
        />
      </View>
    </ScrollView>
  );
}

/** Subscribes to the trip's Durable Object room and refetches when collaborators change something. */
function useLiveRefresh(tripId: string, onChange: () => void) {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      const { loadToken } = await import("@/api");
      const token = await loadToken();
      const connect = () => {
        // React Native's WebSocket accepts headers as a third argument.
        ws = new (WebSocket as unknown as new (u: string, p: string[] | undefined, o: { headers: Record<string, string> }) => WebSocket)(
          `${API_URL.replace(/^http/, "ws")}/api/trips/${tripId}/live`,
          undefined,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        ws.onmessage = (e) => {
          if (typeof e.data === "string" && !e.data.includes('"presence"')) onChange();
        };
        ws.onopen = () => (retry = 0);
        ws.onclose = () => {
          if (!closed) timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
        };
      };
      connect();
    })();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);
}
