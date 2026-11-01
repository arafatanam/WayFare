import type { Trip } from "@wayfare/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, ScrollView, View } from "react-native";
import { get } from "@/api";
import { TripCard } from "@/components";
import { Button, Chip, Empty, Loading, s } from "@/ui";

const TABS = ["all", "upcoming", "active", "draft", "completed", "shared"] as const;

export default function Trips() {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["trips"], queryFn: () => get<Trip[]>("/trips") });
  const list = (data ?? []).filter((t) => (tab === "all" ? t.phase !== "archived" : tab === "shared" ? t.role !== "owner" : t.phase === tab));

  return (
    <View style={s.screen}>
      <View style={{ padding: 16, gap: 10 }}>
        <Button title="+ New trip" onPress={() => router.push("/new-trip")} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {TABS.map((t) => (
            <Chip key={t} label={t[0].toUpperCase() + t.slice(1)} active={tab === t} onPress={() => setTab(t)} />
          ))}
        </ScrollView>
      </View>
      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(t) => t.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12 }}
          ListEmptyComponent={<Empty title="No trips here" body="Create a trip with a destination and dates, then let AI suggest a plan." />}
          renderItem={({ item }) => <TripCard trip={item} />}
        />
      )}
    </View>
  );
}
