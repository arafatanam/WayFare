import { PLACE_CATEGORIES, type Collection, type Place } from "@wayfare/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, ScrollView, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { get } from "@/api";
import { PlaceRow } from "@/components";
import { Button, Card, Chip, emoji, Empty, Input, Loading, s } from "@/ui";

export default function Saved() {
  const router = useRouter();
  const [tab, setTab] = useState<"places" | "collections">("places");
  const [view, setView] = useState<"list" | "map">("list");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams();
  if (debounced) params.set("q", debounced);
  if (category) params.set("category", category);
  const places = useQuery({ queryKey: ["places", debounced, category], queryFn: () => get<Place[]>(`/places?${params}`) });
  const collections = useQuery({ queryKey: ["collections"], queryFn: () => get<Collection[]>("/collections"), enabled: tab === "collections" });

  const located = places.data?.filter((p) => p.lat != null && p.lng != null) ?? [];

  return (
    <View style={s.screen}>
      <View style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Places" active={tab === "places"} onPress={() => setTab("places")} />
          <Chip label="Collections" active={tab === "collections"} onPress={() => setTab("collections")} />
          {tab === "places" && <Chip label={view === "list" ? "🗺️ Map" : "☰ List"} onPress={() => setView(view === "list" ? "map" : "list")} />}
        </View>
        {tab === "places" && (
          <>
            <Input placeholder="Search by name, city, notes…" value={q} onChangeText={setQ} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <Chip label="All" active={!category} onPress={() => setCategory(undefined)} />
              {PLACE_CATEGORIES.map((c) => (
                <Chip key={c} label={`${emoji(c)} ${c}`} active={category === c} onPress={() => setCategory(category === c ? undefined : c)} />
              ))}
            </ScrollView>
          </>
        )}
      </View>

      {tab === "collections" ? (
        collections.isLoading ? (
          <Loading />
        ) : (
          <FlatList
            data={collections.data ?? []}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10 }}
            ListEmptyComponent={<Empty title="No collections yet" body="Create collections on the web or from a place's page." />}
            renderItem={({ item }) => (
              <Card onPress={() => router.push(`/collection/${item.id}`)}>
                <Text style={{ fontWeight: "600" }}>{item.name}</Text>
                <Text style={s.muted}>{item.placeCount} places</Text>
              </Card>
            )}
          />
        )
      ) : places.isLoading ? (
        <Loading />
      ) : view === "map" ? (
        <View style={{ flex: 1 }}>
          <MapView
            style={{ flex: 1 }}
            initialRegion={located[0] ? { latitude: located[0].lat!, longitude: located[0].lng!, latitudeDelta: 0.5, longitudeDelta: 0.5 } : undefined}
          >
            {located.map((p) => (
              <Marker key={p.id} coordinate={{ latitude: p.lat!, longitude: p.lng! }} title={p.name} description={p.city ?? undefined} onCalloutPress={() => router.push(`/place/${p.id}`)} />
            ))}
          </MapView>
          {located.length < (places.data?.length ?? 0) && (
            <Text style={[s.muted, { padding: 8 }]}>{(places.data?.length ?? 0) - located.length} place(s) without a location are only in the list.</Text>
          )}
        </View>
      ) : (
        <FlatList
          data={places.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10 }}
          onRefresh={places.refetch}
          refreshing={places.isRefetching}
          ListEmptyComponent={
            <Empty
              title={debounced || category ? "No matching places" : "Your library is empty"}
              body="Paste a link, upload a screenshot or search for a place."
              action={<Button title="Save a place" onPress={() => router.push("/import")} />}
            />
          }
          renderItem={({ item }) => <PlaceRow place={item} />}
        />
      )}
    </View>
  );
}
