import type { Collection, Place } from "@wayfare/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { del, get } from "@/api";
import { PlaceRow } from "@/components";
import { colors, Empty, Loading, s } from "@/ui";

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["collection", id], queryFn: () => get<Collection & { places: Place[] }>(`/collections/${id}`) });
  if (isLoading || !data) return <Loading />;
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: data.name }} />
      <FlatList
        data={data.places}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={data.description ? <Text style={[s.muted, { marginBottom: 6 }]}>{data.description}</Text> : undefined}
        ListEmptyComponent={<Empty title="This collection is empty" />}
        renderItem={({ item }) => (
          <PlaceRow
            place={item}
            right={
              <Pressable
                accessibilityLabel={`Remove ${item.name} from collection`}
                hitSlop={10}
                onPress={async () => {
                  // Removes from this collection only; the place stays in the library.
                  await del(`/collections/${id}/places/${item.id}`);
                  refetch();
                  qc.invalidateQueries({ queryKey: ["collections"] });
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
              </Pressable>
            }
          />
        )}
      />
    </View>
  );
}
