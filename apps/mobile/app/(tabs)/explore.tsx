import type { GeoResult } from "@wayfare/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { get, post } from "@/api";
import { Button, Card, emoji, Input, s } from "@/ui";

export default function Explore() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const qc = useQueryClient();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => get<GeoResult[]>(`/explore/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });

  return (
    <View style={s.screen}>
      <View style={{ padding: 16 }}>
        <Input placeholder="Search any place, landmark or restaurant" value={q} onChangeText={setQ} autoCorrect={false} />
        {isFetching && <Text style={[s.muted, { marginTop: 6 }]}>Searching…</Text>}
      </View>
      <FlatList
        data={data ?? []}
        keyExtractor={(r) => r.externalId}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10 }}
        ListEmptyComponent={debounced.length >= 2 && !isFetching ? <Text style={s.muted}>No places found.</Text> : undefined}
        renderItem={({ item }) => (
          <Card style={s.row}>
            <Text style={{ fontSize: 24 }}>{emoji(item.category)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600" }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={s.muted} numberOfLines={1}>
                {item.address ?? [item.city, item.country].filter(Boolean).join(", ")}
              </Text>
            </View>
            <Button
              title={saved.includes(item.externalId) ? "Saved" : "Save"}
              variant={saved.includes(item.externalId) ? "secondary" : "primary"}
              disabled={saved.includes(item.externalId)}
              style={{ height: 36 }}
              onPress={async () => {
                try {
                  await post("/places", { ...item, sourcePlatform: "search" });
                  setSaved([...saved, item.externalId]);
                  qc.invalidateQueries({ queryKey: ["places"] });
                  qc.invalidateQueries({ queryKey: ["home"] });
                } catch (e) {
                  Alert.alert("Couldn't save", (e as Error).message);
                }
              }}
            />
          </Card>
        )}
      />
    </View>
  );
}
