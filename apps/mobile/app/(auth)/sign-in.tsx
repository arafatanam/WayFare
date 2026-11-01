import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signIn } from "@/api";
import { Button, colors, Input, s } from "@/ui";
import { useAuth } from "../_layout";

export default function SignIn() {
  const { setSignedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      setSignedIn(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.pad, { flex: 1, justifyContent: "center" }]}>
        <Text style={[s.h1, { color: colors.brand }]}>Wayfare</Text>
        <Text style={s.muted}>From saved posts to a real itinerary.</Text>
        <View style={{ gap: 12, marginTop: 24 }}>
          <Input label="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
          <Input label="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
          {error && <Text style={{ color: colors.danger }}>{error}</Text>}
          <Button title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
          <Link href="/(auth)/sign-up" style={{ textAlign: "center", color: colors.brand, fontWeight: "600", marginTop: 8 }}>
            New here? Create an account
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
