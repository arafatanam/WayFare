import { Link } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signUp } from "@/api";
import { Button, colors, Input, s } from "@/ui";
import { useAuth } from "../_layout";

export default function SignUp() {
  const { setSignedIn } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (form.password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    setError(null);
    try {
      await signUp(form.name.trim(), form.email.trim(), form.password);
      setSignedIn(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={[s.pad, { paddingTop: 60 }]}>
        <Text style={s.h1}>Create your account</Text>
        <Text style={s.muted}>Save places from anywhere and turn them into trips.</Text>
        <View style={{ gap: 12, marginTop: 20 }}>
          <Input label="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
          <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(email) => setForm({ ...form, email })} />
          <Input label="Password" secureTextEntry value={form.password} onChangeText={(password) => setForm({ ...form, password })} />
          {error && <Text style={{ color: colors.danger }}>{error}</Text>}
          <Button title="Create account" onPress={submit} loading={busy} disabled={!form.name || !form.email} />
          <Link href="/(auth)/sign-in" style={{ textAlign: "center", color: colors.brand, fontWeight: "600", marginTop: 8 }}>
            I already have an account
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
