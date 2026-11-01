import type { ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { CATEGORY_META, type PlaceCategory } from "@wayfare/shared";
import { mediaUrl } from "./api";

export const colors = {
  brand: "#0f766e",
  brandDark: "#115e59",
  brandSoft: "#f0fdfa",
  sun: "#f97316",
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  canvas: "#f8fafc",
  white: "#ffffff",
  danger: "#dc2626",
};

export function Button({ title, onPress, variant = "primary", disabled, loading, style }: { title: string; onPress: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; disabled?: boolean; loading?: boolean; style?: ViewStyle }) {
  const bg = { primary: colors.brand, secondary: colors.white, ghost: "transparent", danger: colors.danger }[variant];
  const fg = variant === "primary" || variant === "danger" ? colors.white : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderWidth: variant === "secondary" ? 1 : 0 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {props.label && <Text style={s.label}>{props.label}</Text>}
      <TextInput placeholderTextColor="#94a3b8" {...props} style={[s.input, props.multiline && { minHeight: 90, textAlignVertical: "top", paddingTop: 10 }, props.style]} />
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.9 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Cover({ uri, emoji, size, style }: { uri?: string | null; emoji?: string; size?: number; style?: ViewStyle }) {
  const src = mediaUrl(uri);
  const box = size ? { width: size, height: size, borderRadius: 12 } : {};
  return src ? (
    <Image source={{ uri: src }} style={[{ backgroundColor: colors.line }, box, style as object]} />
  ) : (
    <View style={[{ backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }, box, style]}>
      <Text style={{ fontSize: (size ?? 60) / 2.4 }}>{emoji ?? "📍"}</Text>
    </View>
  );
}

export const emoji = (c: PlaceCategory) => CATEGORY_META[c]?.emoji ?? "📍";

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={[s.card, { alignItems: "center", padding: 28, gap: 8 }]}>
      <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{title}</Text>
      {body && <Text style={{ color: colors.muted, textAlign: "center" }}>{body}</Text>}
      {action}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
      <Text style={{ fontSize: 13, color: active ? colors.brandDark : colors.ink, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  pad: { padding: 16, gap: 14 },
  h1: { fontSize: 28, fontWeight: "700", color: colors.ink },
  h2: { fontSize: 18, fontWeight: "600", color: colors.ink },
  muted: { color: colors.muted, fontSize: 13 },
  btn: { height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderColor: colors.line },
  btnText: { fontSize: 15, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "500", color: "#334155" },
  input: { height: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, backgroundColor: colors.white, fontSize: 15, color: colors.ink },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 12 },
  chip: { paddingHorizontal: 12, height: 34, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
