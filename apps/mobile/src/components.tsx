import type { Place, Trip } from "@wayfare/shared";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Card, colors, Cover, emoji, s } from "./ui";

export function PlaceRow({ place, onPress, right }: { place: Place; onPress?: () => void; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <Card onPress={onPress ?? (() => router.push(`/place/${place.id}`))} style={{ ...s.row }}>
      <Cover uri={place.imageUrl} emoji={emoji(place.category)} size={56} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "600", color: colors.ink }} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={s.muted} numberOfLines={1}>
          {[place.city, place.country].filter(Boolean).join(", ") || place.address || "No location yet"}
        </Text>
        {place.visited && <Text style={{ color: colors.brand, fontSize: 12, fontWeight: "600" }}>✓ Visited</Text>}
      </View>
      {right}
    </Card>
  );
}

export function TripCard({ trip }: { trip: Trip }) {
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/trip/${trip.id}`)} style={{ padding: 0, overflow: "hidden" }}>
      <Cover uri={trip.coverImageUrl} emoji="✈️" style={{ height: 120 }} />
      <View style={{ padding: 12, gap: 2 }}>
        <Text style={s.h2} numberOfLines={1}>
          {trip.name}
        </Text>
        <Text style={s.muted}>
          {trip.destination} · {trip.startDate} → {trip.endDate}
        </Text>
        <Text style={{ fontSize: 12, color: colors.brand, fontWeight: "600", textTransform: "capitalize" }}>
          {trip.phase}
          {trip.role !== "owner" ? ` · shared (${trip.role})` : ""}
        </Text>
      </View>
    </Card>
  );
}
