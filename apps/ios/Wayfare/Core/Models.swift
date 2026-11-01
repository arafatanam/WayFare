import Foundation

// Mirrors the response types in packages/shared/src/index.ts.

struct Place: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var address: String?
    var city: String?
    var country: String?
    var lat: Double?
    var lng: Double?
    var category: String
    var imageUrl: String?
    var sourceUrl: String?
    var sourcePlatform: String
    var sourceText: String?
    var notes: String?
    var aiDescription: String?
    var visited: Bool
    var collectionIds: [String]?
    var tripIds: [String]?
    var readOnly: Bool?

    var locationLine: String {
        address ?? [city, country].compactMap { $0 }.joined(separator: ", ")
    }
}

struct Collection: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var description: String?
    var coverImageUrl: String?
    var visibility: String
    var placeCount: Int
    var previewImages: [String]
}

struct CollectionDetail: Codable {
    let id: String
    var name: String
    var description: String?
    var places: [Place]
}

struct TripPreferences: Codable, Hashable {
    var interests: [String]
    var pace: String
    var travelMode: String
}

struct Trip: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var destination: String
    var destinationLat: Double?
    var destinationLng: Double?
    var startDate: String
    var endDate: String
    var coverImageUrl: String?
    var status: String
    var phase: String
    var visibility: String
    var role: String
    var placeCount: Int
    var memberCount: Int
}

struct TravelLeg: Codable, Hashable {
    let distanceKm: Double
    let minutes: Int
    let mode: String
    let source: String
    var label: String { "\(source == "estimate" ? "~" : "")\(minutes) min \(mode) · \(distanceKm) km" }
}

struct ItemPlace: Codable, Hashable {
    let id: String
    let name: String
    let lat: Double?
    let lng: Double?
    let category: String
    let imageUrl: String?
    let city: String?
}

struct ItineraryItem: Codable, Identifiable, Hashable {
    let id: String
    let dayId: String
    let placeId: String?
    let place: ItemPlace?
    let title: String?
    let startTime: String?
    let durationMinutes: Int?
    let notes: String?
    let position: Int
    let aiGenerated: Bool
    let travelToNext: TravelLeg?
    var displayName: String { place?.name ?? title ?? "Activity" }
}

struct ItineraryDay: Codable, Identifiable, Hashable {
    let id: String
    let dayNumber: Int
    let date: String
    let title: String?
    let notes: String?
    let warnings: [String]
    let items: [ItineraryItem]
}

struct Member: Codable, Identifiable, Hashable {
    var id: String { userId }
    let userId: String
    let name: String
    let email: String
    let role: String
}

struct TripDetail: Codable {
    let trip: Trip
    let places: [Place]
    let members: [Member]
    let days: [ItineraryDay]
}

struct ProposalCandidate: Codable, Hashable { let name: String }
struct ProposalItem: Codable, Hashable {
    let placeId: String?
    let candidate: ProposalCandidate?
    let title: String?
    let startTime: String?
}
struct ProposalDay: Codable, Hashable {
    let dayNumber: Int
    let title: String?
    let items: [ProposalItem]
}
struct ItineraryProposal: Codable, Identifiable {
    let id: String
    let scope: String
    let dayNumber: Int?
    let status: String
    let error: String?
    let days: [ProposalDay]
    let warnings: [String]
}

struct ImportCandidate: Codable, Hashable {
    let name: String
    let address: String?
    let city: String?
    let country: String?
    let lat: Double?
    let lng: Double?
    let category: String
    let externalId: String?
    let confidence: Double
    let reason: String?
}

struct ImportJob: Codable, Identifiable {
    let id: String
    let type: String
    let platform: String
    let status: String
    let title: String?
    let caption: String?
    let candidates: [ImportCandidate]
    let error: String?
}

struct GeoResult: Codable, Identifiable, Hashable {
    var id: String { externalId }
    let name: String
    let address: String?
    let city: String?
    let country: String?
    let lat: Double
    let lng: Double
    let category: String
    let externalId: String
}

struct Usage: Codable {
    struct Limits: Codable { let aiGenerationsPerMonth: Int; let importsPerMonth: Int }
    let aiGenerations: Int
    let imports: Int
    let limits: Limits
}

struct Me: Codable {
    let id: String
    let name: String
    let email: String
    let emailVerified: Bool
    let onboarded: Bool
    let plan: String
    let usage: Usage
}

struct HomeData: Codable {
    struct Counts: Codable { let places: Int; let collections: Int; let trips: Int }
    let upcomingTrips: [Trip]
    let recentPlaces: [Place]
    let recentCollections: [Collection]
    let counts: Counts
}

let categoryEmoji: [String: String] = [
    "food": "🍜", "cafe": "☕", "bar": "🍸", "nature": "🌿", "beach": "🏖️", "history": "🏛️", "museum": "🖼️",
    "architecture": "🏙️", "shopping": "🛍️", "nightlife": "🌙", "outdoors": "🥾", "viewpoint": "🌄", "hotel": "🛏️", "other": "📍",
]
func emoji(_ category: String) -> String { categoryEmoji[category] ?? "📍" }
