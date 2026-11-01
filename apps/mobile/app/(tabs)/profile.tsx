import type { Me } from "@wayfare/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Alert, Linking, ScrollView, Switch, Text, View } from "react-native";
import { API_URL, get, patch, post, signOut } from "@/api";
import { devMode, Notifications } from "@/native";
import { usePaywall } from "@/paywall";
import { Button, Card, colors, Loading, s } from "@/ui";
import { useAuth } from "../_layout";

export default function Profile() {
  const { setSignedIn, replayOnboarding } = useAuth();
  const qc = useQueryClient();
  const { data: me, isLoading, refetch } = useQuery({ queryKey: ["me"], queryFn: () => get<Me>("/me") });
  // Superwall shows the paywall configured for the "upgrade" placement; purchases reach the API via webhook.
  const paywall = usePaywall();

  useEffect(() => {
    // Identify with our user id so Superwall webhooks map purchases to this account.
    if (me?.id) paywall.identify(me.id);
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !me) return <Loading />;

  const setNotif = async (key: keyof Me["preferences"]["notifications"], value: boolean) => {
    if (value && Notifications) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") Alert.alert("Notifications are off", "You can still get in-app notifications. Enable them in system settings for push.");
    }
    await patch("/me/profile", { preferences: { notifications: { ...me.preferences.notifications, [key]: value } } });
    refetch();
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Card>
        <Text style={s.h2}>{me.name}</Text>
        <Text style={s.muted}>
          {me.email} {me.emailVerified ? "· verified" : "· not verified"}
        </Text>
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={s.h2}>{me.plan === "pro" ? "Wayfare Pro" : "Free plan"}</Text>
        <Text style={s.muted}>
          {me.usage.aiGenerations}/{me.usage.limits.aiGenerationsPerMonth} AI itineraries · {me.usage.imports}/{me.usage.limits.importsPerMonth} imports this month
        </Text>
        {me.plan === "free" ? (
          <Button
            title="Upgrade to Pro"
            onPress={() =>
              paywall.enabled
                ? paywall.show("upgrade").then(() => setTimeout(refetch, 2000))
                : Alert.alert("Paywall unavailable", "Purchases need a development or store build with Superwall keys. They don't work in Expo Go.")
            }
          />
        ) : me.subscription?.provider === "stripe" ? (
          <Text style={s.muted}>Billed on the web. Manage it at {API_URL}/profile/subscription.</Text>
        ) : (
          <Text style={s.muted}>Manage your subscription in your device's store settings.</Text>
        )}
      </Card>

      <Card style={{ gap: 4 }}>
        <Text style={s.h2}>Notifications</Text>
        {(
          [
            ["tripReminders", "Trip reminders"],
            ["collaboration", "Collaboration"],
            ["imports", "Imports"],
            ["itinerary", "Itineraries"],
          ] as const
        ).map(([k, label]) => (
          <View key={k} style={[s.row, { justifyContent: "space-between", paddingVertical: 6 }]}>
            <Text>{label}</Text>
            <Switch value={me.preferences.notifications[k]} onValueChange={(v) => setNotif(k, v)} trackColor={{ true: colors.brand }} />
          </View>
        ))}
        <Text style={s.muted}>Lock-screen notifications never include trip names or places.</Text>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={s.h2}>Privacy & data</Text>
        <Button title="Privacy policy" variant="secondary" onPress={() => Linking.openURL(`${API_URL}/privacy`)} />
        <Button
          title="Delete account"
          variant="danger"
          onPress={() =>
            Alert.alert("Delete your account?", "This permanently deletes your places, collections, trips you own and uploads.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  try {
                    await post("/auth/delete-user", {});
                    await signOut();
                    qc.clear();
                    setSignedIn(false);
                  } catch (e) {
                    Alert.alert("Couldn't delete account", (e as Error).message);
                  }
                },
              },
            ])
          }
        />
      </Card>

      {devMode && (
        <Card style={{ gap: 8 }}>
          <Text style={s.h2}>Dev tools</Text>
          <Text style={s.muted}>Dev mode is on: no sign-in, limits or paywall.</Text>
          <Button title="Replay onboarding" variant="secondary" onPress={replayOnboarding} />
        </Card>
      )}

      <Button
        title="Sign out"
        variant="secondary"
        onPress={async () => {
          await signOut();
          qc.clear();
          setSignedIn(false);
        }}
      />
    </ScrollView>
  );
}
