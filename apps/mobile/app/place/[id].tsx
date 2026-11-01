import { CATEGORY_META, mapsUrl, type Place, type Trip } from "@wayfare/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, ScrollView, Share, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { del, get, patch, post } from "@/api";
import { Button, Card, colors, Cover, emoji, Input, Loading, s } from "@/ui";

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: place, isLoading, refetch } = useQuery({ queryKey: ["place", id], queryFn: () => get<Place & { readOnly: boolean }>(`/places/${id}`) });
  const { data: trips } = useQuery({ queryKey: ["trips"], queryFn: () => get<Trip[]>("/trips") });
  const [notes, setNotes] = useState<string | null>(null);

  if (isLoading || !place) return <Loading />;
  const refresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["places"] });
    qc.invalidateQueries({ queryKey: ["home"] });
  };

  const addToTrip = () => {
    const editable = (trips ?? []).filter((t) => t.role !== "viewer" && t.phase !== "archived" && t.phase !== "completed");
    if (!editable.length) return Alert.alert("No trips yet", "Create a trip first.");
    Alert.alert("Add to trip", undefined, [
      ...editable.slice(0, 6).map((t) => ({
        text: t.name,
        onPress: async () => {
          await post(`/trips/${t.id}/places`, { placeIds: [place.id] });
          qc.invalidateQueries({ queryKey: ["trip", t.id] });
          Alert.alert("Added", `${place.name} was added to ${t.name}.`);
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: place.name }} />
      <Cover uri={place.imageUrl} emoji={emoji(place.category)} style={{ height: 200 }} />
      <View style={s.pad}>
        <Text style={s.muted}>
          {emoji(place.category)} {CATEGORY_META[place.category].label}
          {place.visited ? " · ✓ Visited" : ""}
        </Text>
        <Text style={s.h1}>{place.name}</Text>
        <Text style={s.muted}>{place.address ?? [place.city, place.country].filter(Boolean).join(", ")}</Text>

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button title="Open in Maps" onPress={() => Linking.openURL(mapsUrl(place))} style={{ flexGrow: 1 }} />
          <Button title="Share" variant="secondary" onPress={() => Share.share({ message: `${place.name} — ${mapsUrl(place)}` })} style={{ flexGrow: 1 }} />
        </View>
        {!place.readOnly && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              title={place.visited ? "Visited ✓" : "Mark visited"}
              variant="secondary"
              onPress={async () => {
                await patch(`/places/${place.id}`, { visited: !place.visited });
                refresh();
              }}
              style={{ flex: 1 }}
            />
            <Button title="Add to trip" variant="secondary" onPress={addToTrip} style={{ flex: 1 }} />
          </View>
        )}

        {place.lat != null && place.lng != null && (
          <MapView style={{ height: 180, borderRadius: 16 }} initialRegion={{ latitude: place.lat, longitude: place.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}>
            <Marker coordinate={{ latitude: place.lat, longitude: place.lng }} title={place.name} />
          </MapView>
        )}

        {!place.readOnly && (
          <Card style={{ gap: 8 }}>
            <Text style={s.h2}>Your notes</Text>
            <Text style={s.muted}>Private — only you can see these.</Text>
            <Input multiline value={notes ?? place.notes ?? ""} onChangeText={setNotes} placeholder="What to order, best time to go…" />
            {notes !== null && notes !== (place.notes ?? "") && (
              <Button
                title="Save notes"
                onPress={async () => {
                  await patch(`/places/${place.id}`, { notes: notes.trim() || null });
                  setNotes(null);
                  refresh();
                }}
              />
            )}
          </Card>
        )}

        {place.aiDescription && (
          <Card style={{ gap: 4 }}>
            <Text style={s.h2}>✨ AI suggestion</Text>
            <Text style={s.muted}>Generated automatically — may be inaccurate.</Text>
            <Text>{place.aiDescription}</Text>
          </Card>
        )}

        {(place.sourceUrl || place.sourceText) && (
          <Card style={{ gap: 6 }}>
            <Text style={s.h2}>Original source</Text>
            {place.sourceText && <Text style={{ fontStyle: "italic", color: colors.muted }}>{place.sourceText}</Text>}
            {place.sourceUrl && (
              <Text style={{ color: colors.brand, fontWeight: "600" }} onPress={() => Linking.openURL(place.sourceUrl!)}>
                Open source link
              </Text>
            )}
          </Card>
        )}

        {!place.readOnly && (
          <Button
            title="Delete place"
            variant="ghost"
            onPress={() =>
              Alert.alert("Delete this place?", "It will be removed from your library, collections and trips.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    await del(`/places/${place.id}`);
                    qc.invalidateQueries({ queryKey: ["places"] });
                    router.back();
                  },
                },
              ])
            }
          />
        )}
      </View>
    </ScrollView>
  );
}
