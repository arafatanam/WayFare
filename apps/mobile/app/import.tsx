import type { ImportCandidate, ImportJob } from "@wayfare/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { get, post, uploadScreenshot } from "@/api";
import { Button, Card, Chip, colors, emoji, Input, Loading, s } from "@/ui";

type Mode = "link" | "screenshot" | "search" | "manual";

export default function ImportScreen() {
  const params = useLocalSearchParams<{ importId?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("link");
  const [jobId, setJobId] = useState<string | null>(params.importId ?? null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [manual, setManual] = useState({ name: "", city: "", country: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const start = async (fn: () => Promise<ImportJob>) => {
    setBusy(true);
    try {
      const job = await fn();
      setJobId(job.id);
    } catch (e) {
      Alert.alert("Couldn't import", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const done = () => {
    qc.invalidateQueries({ queryKey: ["places"] });
    qc.invalidateQueries({ queryKey: ["home"] });
    router.back();
  };

  if (jobId) return <Review jobId={jobId} onDone={done} onManual={() => { setJobId(null); setMode("manual"); }} />;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {(["link", "screenshot", "search", "manual"] as Mode[]).map((m) => (
          <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} active={mode === m} onPress={() => setMode(m)} />
        ))}
      </View>

      {mode === "link" && (
        <>
          <Text style={s.muted}>Paste a link from Instagram, TikTok, Google Maps or any travel article.</Text>
          <Input placeholder="https://" autoCapitalize="none" keyboardType="url" value={url} onChangeText={setUrl} />
          <Button title="Find places" loading={busy} disabled={!url} onPress={() => start(() => post<ImportJob>("/imports", { type: "url", url: url.trim() }))} />
        </>
      )}
      {mode === "screenshot" && (
        <>
          <Text style={s.muted}>Pick a screenshot of a post, map or article. We only read the image you choose.</Text>
          <Button
            title="Choose screenshot"
            loading={busy}
            onPress={async () => {
              const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
              if (res.canceled) return;
              const a = res.assets[0];
              start(() => uploadScreenshot<ImportJob>(a.uri, a.mimeType ?? "image/jpeg"));
            }}
          />
        </>
      )}
      {mode === "search" && (
        <>
          <Input placeholder="Place name, e.g. Pena Palace Sintra" value={text} onChangeText={setText} />
          <Button title="Search" loading={busy} disabled={text.trim().length < 2} onPress={() => start(() => post<ImportJob>("/imports", { type: "text", text: text.trim() }))} />
        </>
      )}
      {mode === "manual" && (
        <>
          <Input label="Name" value={manual.name} onChangeText={(name) => setManual({ ...manual, name })} />
          <Input label="City" value={manual.city} onChangeText={(city) => setManual({ ...manual, city })} />
          <Input label="Country" value={manual.country} onChangeText={(country) => setManual({ ...manual, country })} />
          <Input label="Notes" multiline value={manual.notes} onChangeText={(notes) => setManual({ ...manual, notes })} />
          <Button
            title="Save place"
            loading={busy}
            disabled={!manual.name.trim()}
            onPress={async () => {
              setBusy(true);
              try {
                await post("/places", {
                  name: manual.name.trim(),
                  city: manual.city.trim() || null,
                  country: manual.country.trim() || null,
                  notes: manual.notes.trim() || null,
                  sourcePlatform: "manual",
                });
                done();
              } catch (e) {
                Alert.alert("Couldn't save", (e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
    </ScrollView>
  );
}

function Review({ jobId, onDone, onManual }: { jobId: string; onDone: () => void; onManual: () => void }) {
  const { data: job, refetch } = useQuery({
    queryKey: ["import", jobId],
    queryFn: () => get<ImportJob>(`/imports/${jobId}`),
    refetchInterval: (q) => (!q.state.data || ["queued", "processing"].includes(q.state.data.status) ? 2000 : false),
  });
  const [selected, setSelected] = useState<Record<number, boolean> | null>(null);
  const [busy, setBusy] = useState(false);

  if (!job || job.status === "queued" || job.status === "processing") {
    return (
      <View style={[s.screen, s.pad]}>
        <Loading />
        <Text style={[s.muted, { textAlign: "center" }]}>Looking for places… you can close this — we'll notify you.</Text>
      </View>
    );
  }
  if (job.status === "failed") {
    return (
      <View style={[s.screen, s.pad]}>
        <Card style={{ backgroundColor: "#fffbeb", gap: 6 }}>
          <Text style={{ fontWeight: "600" }}>We couldn't extract a place automatically</Text>
          <Text>{job.error}</Text>
        </Card>
        {job.type !== "text" && (
          <Button
            title="Retry"
            variant="secondary"
            onPress={async () => {
              await post(`/imports/${job.id}/retry`).catch((e) => Alert.alert("Retry failed", e.message));
              refetch();
            }}
          />
        )}
        <Button title="Add manually" onPress={onManual} />
      </View>
    );
  }
  if (job.status === "completed") return <View style={s.pad}><Text>Already saved.</Text></View>;

  const sel = selected ?? Object.fromEntries(job.candidates.map((c, i) => [i, c.confidence >= 0.6 || job.candidates.length === 1]));
  const chosen = job.candidates.filter((_, i) => sel[i]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={s.h2}>{job.title ?? "Imported content"}</Text>
      <Text style={s.muted}>Review what we found and uncheck anything wrong.</Text>
      {job.candidates.map((c: ImportCandidate, i) => (
        <Card key={i} style={s.row}>
          <Text style={{ fontSize: 22 }}>{emoji(c.category)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "600" }}>{c.name}</Text>
            <Text style={s.muted} numberOfLines={2}>
              {c.lat != null ? (c.address ?? [c.city, c.country].filter(Boolean).join(", ")) : "Location not found — set it later"}
            </Text>
            {c.confidence < 0.6 && <Text style={{ color: colors.sun, fontSize: 12, fontWeight: "600" }}>Unsure</Text>}
          </View>
          <Switch value={!!sel[i]} onValueChange={(v) => setSelected({ ...sel, [i]: v })} trackColor={{ true: colors.brand }} />
        </Card>
      ))}
      <Button
        title={`Save ${chosen.length} place${chosen.length === 1 ? "" : "s"}`}
        disabled={!chosen.length}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await post(`/imports/${job.id}/confirm`, {
              places: chosen.map((c) => ({ name: c.name, address: c.address, city: c.city, country: c.country, lat: c.lat, lng: c.lng, category: c.category, externalId: c.externalId })),
            });
            onDone();
          } catch (e) {
            Alert.alert("Couldn't save", (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button title="Not right? Add manually" variant="ghost" onPress={onManual} />
    </ScrollView>
  );
}
