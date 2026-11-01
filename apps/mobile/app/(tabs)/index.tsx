import type { Collection, ImportJob, Place, Trip } from "@wayfare/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { get } from "@/api";
import { PlaceRow, TripCard } from "@/components";
import { Button, Card, colors, Empty, Loading, s } from "@/ui";

interface Home {
  upcomingTrips: Trip[];
  recentPlaces: Place[];
  recentCollections: Collection[];
  pendingImports: ImportJob[];
  counts: { places: number; collections: number; trips: number };
}

export default function HomeScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching, error } = useQuery({ queryKey: ["home"], queryFn: () => get<Home>("/me/home") });

  if (isLoading) return <Loading />;
  const empty = data && !data.counts.places && !data.counts.trips;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}>
      <Text style={s.h1}>Where to next?</Text>
      {error && <Text style={{ color: colors.danger }}>{(error as Error).message}</Text>}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button title="+ Save a place" onPress={() => router.push("/import")} style={{ flex: 1 }} />
        <Button title="New trip" variant="secondary" onPress={() => router.push("/new-trip")} style={{ flex: 1 }} />
      </View>

      {empty && <Empty title="Let's start your first plan" body="Save a place you saw online, or create a trip with a destination and dates." />}

      {data?.pendingImports.map((j) => (
        <Card key={j.id} onPress={() => router.push({ pathname: "/import", params: { importId: j.id } })}>
          <Text style={{ fontWeight: "600" }} numberOfLines={1}>
            {j.title ?? "Import"}
          </Text>
          <Text style={s.muted}>
            {j.status === "needs_review" ? `${j.candidates.length} place(s) found — tap to review` : j.status === "failed" ? "Needs attention" : "Finding places…"}
          </Text>
        </Card>
      ))}

      {!!data?.upcomingTrips.length && (
        <>
          <Text style={s.h2}>Upcoming trips</Text>
          {data.upcomingTrips.slice(0, 3).map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </>
      )}
      {!!data?.recentPlaces.length && (
        <>
          <Text style={s.h2}>Recently saved</Text>
          {data.recentPlaces.slice(0, 5).map((p) => (
            <PlaceRow key={p.id} place={p} />
          ))}
        </>
      )}
      {!!data?.recentCollections.length && (
        <>
          <Text style={s.h2}>Collections</Text>
          {data.recentCollections.map((c) => (
            <Card key={c.id} onPress={() => router.push(`/collection/${c.id}`)}>
              <Text style={{ fontWeight: "600" }}>{c.name}</Text>
              <Text style={s.muted}>{c.placeCount} places</Text>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}
