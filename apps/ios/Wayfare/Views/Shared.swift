import SwiftUI

struct CoverImage: View {
    let url: String?
    let emoji: String
    var body: some View {
        if let u = APIClient.shared.mediaURL(url) {
            AsyncImage(url: u) { img in img.resizable().scaledToFill() } placeholder: { placeholder }
        } else {
            placeholder
        }
    }
    private var placeholder: some View {
        ZStack {
            LinearGradient(colors: [.brand, .teal.opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(emoji).font(.largeTitle)
        }
    }
}

struct PlaceRow: View {
    let place: Place
    var body: some View {
        HStack(spacing: 12) {
            CoverImage(url: place.imageUrl, emoji: emoji(place.category))
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 2) {
                Text(place.name).font(.headline).lineLimit(1)
                Text(place.locationLine.isEmpty ? "No location yet" : place.locationLine)
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                if place.visited { Text("✓ Visited").font(.caption.bold()).foregroundStyle(Color.brand) }
            }
        }
    }
}

struct TripRow: View {
    let trip: Trip
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            CoverImage(url: trip.coverImageUrl, emoji: "✈️")
                .frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            Text(trip.name).font(.headline)
            Text("\(trip.destination) · \(trip.startDate) → \(trip.endDate)").font(.subheadline).foregroundStyle(.secondary)
            Text(trip.role == "owner" ? trip.phase.capitalized : "\(trip.phase.capitalized) · shared (\(trip.role))")
                .font(.caption.bold()).foregroundStyle(Color.brand)
        }
        .padding(.vertical, 4)
    }
}

/// Loads async data with loading/error states and retry.
struct AsyncContent<T, Content: View>: View {
    let load: () async throws -> T
    @ViewBuilder let content: (T, @escaping () async -> Void) -> Content
    @State private var value: T?
    @State private var error: String?

    var body: some View {
        Group {
            if let value {
                content(value, reload)
            } else if let error {
                ContentUnavailableView {
                    Label("Something went wrong", systemImage: "exclamationmark.triangle")
                } description: { Text(error) } actions: {
                    Button("Try again") { Task { await reload() } }
                }
            } else {
                ProgressView()
            }
        }
        .task { await reload() }
    }

    func reload() async {
        do {
            value = try await load()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
