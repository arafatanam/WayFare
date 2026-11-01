import { PACES, tripInput, type Collection, type GeoResult, type Me, type Trip } from "@wayfare/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { get, post } from "@/api";
import { Button, Card, Chip, colors, Input, s } from "@/ui";

export default function NewTrip() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ destination?: string }>();
  const [dest, setDest] = useState<GeoResult | null>(null);
  const [destQuery, setDestQuery] = useState(params.destination ?? "");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pace, setPace] = useState<(typeof PACES)[number]>("balanced");
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [generate, setGenerate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  const { data: collections } = useQuery({ queryKey: ["collections"], queryFn: () => get<Collection[]>("/collections") });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => get<Me>("/me") });
  // Start from the pace picked during onboarding.
  useEffect(() => {
    if (me) setPace(me.preferences.pace);
  }, [me?.preferences.pace]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = async () => {
    if (destQuery.trim().length < 2) return;
    setResults(await get<GeoResult[]>(`/explore/search?q=${encodeURIComponent(destQuery.trim())}`).catch(() => []));
  };

  // Arriving from onboarding with a destination: look it up straight away.
  useEffect(() => {
    if (params.destination) search();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickDate = (which: "start" | "end", d: Date | undefined) => {
    if (Platform.OS === "android") setPicking(null);
    if (!d) return;
    const iso = toIso(d);
    if (which === "start") {
      setStart(iso);
      if (!end || end < iso) setEnd(iso);
    } else setEnd(iso);
  };

  const create = async () => {
    const payload = {
      name: name.trim() || `Trip to ${dest?.name ?? destQuery}`,
      destination: dest ? [dest.name, dest.country].filter(Boolean).join(", ") : destQuery.trim(),
      destinationLat: dest?.lat ?? null,
      destinationLng: dest?.lng ?? null,
      startDate: start,
      endDate: end,
      preferences: { interests: me?.preferences.interests ?? [], pace, travelMode: me?.preferences.travelMode ?? "walking", budget: me?.preferences.travelProfile.budget },
      collectionIds,
    };
    const parsed = tripInput.safeParse(payload);
    if (!parsed.success) return Alert.alert("Check your trip", parsed.error.issues[0].message);
    setBusy(true);
    try {
      const trip = await post<Trip>("/trips", parsed.data);
      if (generate) await post(`/trips/${trip.id}/itinerary/generate`, { scope: "trip" }).catch((e) => Alert.alert("AI planning", e.message));
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      router.replace(`/trip/${trip.id}`);
    } catch (e) {
      Alert.alert("Couldn't create trip", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {dest ? (
        <Card style={{ ...s.row, justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "600" }}>📍 {[dest.name, dest.country].filter(Boolean).join(", ")}</Text>
          <Text style={{ color: colors.brand, fontWeight: "600" }} onPress={() => setDest(null)}>
            Change
          </Text>
        </Card>
      ) : (
        <>
          <Input label="Destination" placeholder="City, region or country" value={destQuery} onChangeText={setDestQuery} onSubmitEditing={search} returnKeyType="search" />
          {results.map((r) => (
            <Card key={r.externalId} onPress={() => (setDest(r), setResults([]))}>
              <Text style={{ fontWeight: "600" }}>{r.name}</Text>
              <Text style={s.muted}>{[r.city, r.country].filter(Boolean).join(", ")}</Text>
            </Card>
          ))}
        </>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {(["start", "end"] as const).map((which) => {
          const value = which === "start" ? start : end;
          return (
            <Pressable key={which} style={{ flex: 1, gap: 6 }} onPress={() => setPicking(picking === which ? null : which)}>
              <Text style={s.label}>{which === "start" ? "Start date" : "End date"}</Text>
              <View style={[s.input, { justifyContent: "center" }, picking === which && { borderColor: colors.brand }]}>
                <Text style={{ color: value ? colors.ink : "#94a3b8", fontSize: 15 }}>{value ? formatDate(value) : "Pick a date"}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {picking && (
        <Card style={{ padding: Platform.OS === "ios" ? 4 : 0, gap: 4 }}>
          <DateTimePicker
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            value={fromIso((picking === "start" ? start : end) || start) ?? new Date()}
            minimumDate={picking === "end" && start ? fromIso(start) : new Date()}
            accentColor={colors.brand}
            onChange={(_, d) => pickDate(picking, d)}
          />
          {Platform.OS === "ios" && <Button title="Done" variant="ghost" onPress={() => setPicking(null)} />}
        </Card>
      )}
      <Input label="Trip name (optional)" value={name} onChangeText={setName} />
      <Text style={s.h2}>Pace</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {PACES.map((p) => (
          <Chip key={p} label={p} active={pace === p} onPress={() => setPace(p)} />
        ))}
      </View>
      {!!collections?.length && (
        <>
          <Text style={s.h2}>Include collections</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {collections.map((c) => (
              <Chip
                key={c.id}
                label={`${c.name} (${c.placeCount})`}
                active={collectionIds.includes(c.id)}
                onPress={() => setCollectionIds(collectionIds.includes(c.id) ? collectionIds.filter((x) => x !== c.id) : [...collectionIds, c.id])}
              />
            ))}
          </View>
        </>
      )}
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={{ flex: 1 }}>✨ Suggest an itinerary with AI{collectionIds.length ? "" : " (uses your preferences)"}</Text>
        <Switch value={generate} onValueChange={setGenerate} trackColor={{ true: colors.brand }} />
      </View>
      <Button title="Create trip" loading={busy} disabled={!(dest || destQuery.trim()) || !start || !end} onPress={create} />
    </ScrollView>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y ? new Date(y, m - 1, d) : undefined;
};
const formatDate = (iso: string) => fromIso(iso)!.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
