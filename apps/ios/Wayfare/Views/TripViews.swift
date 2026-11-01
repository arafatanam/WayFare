import MapKit
import SwiftUI

struct TripsView: View {
    @State private var trips: [Trip] = []
    @State private var filter = "all"
    @State private var showNew = false
    private let filters = ["all", "upcoming", "active", "draft", "completed", "shared"]

    var shown: [Trip] {
        trips.filter { t in
            switch filter {
            case "all": return t.phase != "archived"
            case "shared": return t.role != "owner"
            default: return t.phase == filter
            }
        }
    }

    var body: some View {
        List {
            Picker("Filter", selection: $filter) { ForEach(filters, id: \.self) { Text($0.capitalized) } }
                .pickerStyle(.menu)
            if shown.isEmpty {
                ContentUnavailableView("No trips here", systemImage: "airplane", description: Text("Create a trip, add places and let AI suggest a plan."))
            }
            ForEach(shown) { t in NavigationLink(value: t) { TripRow(trip: t) } }
        }
        .refreshable { await load() }
        .toolbar { Button { showNew = true } label: { Image(systemName: "plus") } }
        .sheet(isPresented: $showNew, onDismiss: { Task { await load() } }) { NewTripView() }
        .navigationTitle("Trips")
        .navigationDestination(for: Trip.self) { TripDetailView(tripId: $0.id) }
        .task { await load() }
    }

    func load() async { trips = (try? await APIClient.shared.get("/trips")) ?? trips }
}

struct TripDetailView: View {
    let tripId: String
    @State private var detail: TripDetail?
    @State private var proposal: ItineraryProposal?
    @State private var dayIndex = 0
    @State private var error: String?
    @State private var liveTask: URLSessionWebSocketTask?

    private var base: String { "/trips/\(tripId)/itinerary" }

    var body: some View {
        Group {
            if let d = detail {
                content(d)
            } else if let error {
                ContentUnavailableView("Couldn't load trip", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView()
            }
        }
        .task { await load(); connectLive() }
        .onDisappear { liveTask?.cancel(with: .goingAway, reason: nil) }
    }

    @ViewBuilder
    private func content(_ d: TripDetail) -> some View {
        let canEdit = d.trip.role != "viewer" && d.trip.status != "archived"
        let day = d.days[min(dayIndex, max(d.days.count - 1, 0))]
        List {
            Section {
                Text("\(d.trip.destination) · \(d.trip.startDate) → \(d.trip.endDate)").foregroundStyle(.secondary)
                Text("\(d.members.count) traveler\(d.members.count == 1 ? "" : "s") · \(d.places.count) places").font(.caption)
            }
            if let p = proposal, ["queued", "running", "ready", "failed"].contains(p.status) {
                Section("AI itinerary") {
                    switch p.status {
                    case "ready":
                        ForEach(p.days, id: \.dayNumber) { pd in
                            Text("Day \(pd.dayNumber): " + pd.items.map { i in
                                d.places.first { $0.id == i.placeId }?.name ?? i.candidate?.name ?? i.title ?? "Stop"
                            }.joined(separator: " → ")).font(.caption)
                        }
                        ForEach(p.warnings, id: \.self) { Text("⚠️ \($0)").font(.caption) }
                        if canEdit {
                            Button("Use this plan") { Task { let _: [ItineraryDay]? = try? await APIClient.shared.post("\(base)/proposals/\(p.id)/accept"); await load() } }
                            Button("Discard", role: .destructive) { Task { let _: Ok? = try? await APIClient.shared.post("\(base)/proposals/\(p.id)/discard"); await load() } }
                        }
                    case "failed": Text(p.error ?? "Generation failed. Your itinerary is unchanged.")
                    default: HStack { ProgressView(); Text("Building your itinerary…") }
                    }
                }
            }
            Section {
                Picker("Day", selection: $dayIndex) {
                    ForEach(Array(d.days.enumerated()), id: \.offset) { i, dd in Text("Day \(dd.dayNumber)").tag(i) }
                }
                .pickerStyle(.segmented)
            }
            Section(day.title ?? "Day \(day.dayNumber) · \(day.date)") {
                ForEach(day.warnings, id: \.self) { Text("⚠️ \($0)").font(.caption).foregroundStyle(.orange) }
                let located = day.items.filter { $0.place?.lat != nil }
                if !located.isEmpty {
                    Map {
                        ForEach(Array(located.enumerated()), id: \.element.id) { n, i in
                            Marker("\(n + 1). \(i.displayName)", coordinate: .init(latitude: i.place!.lat!, longitude: i.place!.lng!))
                        }
                        MapPolyline(coordinates: located.map { .init(latitude: $0.place!.lat!, longitude: $0.place!.lng!) }).stroke(Color.brand, lineWidth: 3)
                    }
                    .frame(height: 200)
                }
                if day.items.isEmpty { Text("Nothing planned for this day yet.").foregroundStyle(.secondary) }
                ForEach(Array(day.items.enumerated()), id: \.element.id) { n, item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(n + 1). \(item.place.map { emoji($0.category) + " " } ?? "")\(item.displayName)").font(.headline)
                        Text([item.startTime, item.durationMinutes.map { "\($0) min" }].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary)
                        if let notes = item.notes { Text(notes).font(.subheadline) }
                        if let leg = item.travelToNext, n < day.items.count - 1 { Text(leg.label).font(.caption2).foregroundStyle(.secondary) }
                    }
                }
                // Drag to reorder (with VoiceOver, use the rotor's move actions); swipe to delete.
                .onMove { from, to in
                    guard canEdit else { return }
                    var ids = day.items.map(\.id)
                    ids.move(fromOffsets: from, toOffset: to)
                    Task { let _: Ok? = try? await APIClient.shared.put("\(base)/order", JSONBody(["dayId": .string(day.id), "itemIds": .array(ids.map { .string($0) })])); await load() }
                }
                .onDelete { idx in
                    guard canEdit else { return }
                    Task { for i in idx { let _: Ok? = try? await APIClient.shared.delete("\(base)/items/\(day.items[i].id)") }; await load() }
                }
            }
            if canEdit {
                Section {
                    Menu("Add stop") {
                        let scheduled = Set(d.days.flatMap { $0.items.compactMap(\.placeId) })
                        ForEach(d.places.filter { !scheduled.contains($0.id) }) { p in
                            Button(p.name) { Task { let _: Ok? = try? await APIClient.shared.post("\(base)/items", JSONBody(["dayId": .string(day.id), "placeId": .string(p.id)])); await load() } }
                        }
                    }
                    Button("✨ Plan this day with AI") { Task { await generate(scope: "day", dayId: day.id) } }
                    Button("✨ Generate whole itinerary") { Task { await generate(scope: "trip", dayId: nil) } }
                }
            }
            Text("Times marked “~” are estimates. Check opening hours before you go.").font(.caption).foregroundStyle(.secondary)
        }
        .toolbar { if canEdit { EditButton() } }
        .refreshable { await load() }
        .navigationTitle(d.trip.name)
    }

    private func load() async {
        do {
            detail = try await APIClient.shared.get("/trips/\(tripId)")
            proposal = try? await APIClient.shared.get("\(base)/proposals/latest")
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func generate(scope: String, dayId: String?) async {
        var body: [String: JSONValue] = ["scope": .string(scope)]
        if let dayId { body["dayId"] = .string(dayId) }
        do {
            proposal = try await APIClient.shared.post("\(base)/generate", JSONBody(body))
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Joins the trip's Durable Object room; any change from a collaborator triggers a refresh.
    private func connectLive() {
        guard let token = APIClient.shared.token else { return }
        var comps = URLComponents(url: APIClient.shared.baseURL.appendingPathComponent("api/trips/\(tripId)/live"), resolvingAgainstBaseURL: false)!
        comps.scheme = comps.scheme == "https" ? "wss" : "ws"
        var req = URLRequest(url: comps.url!)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let task = URLSession.shared.webSocketTask(with: req)
        liveTask = task
        task.resume()
        func receive() {
            task.receive { result in
                if case .success(.string(let s)) = result, !s.contains("\"presence\"") {
                    Task { @MainActor in await load() }
                }
                if case .success = result { receive() }
            }
        }
        receive()
    }
}

struct NewTripView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var destination = ""
    @State private var results: [GeoResult] = []
    @State private var picked: GeoResult?
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(86400 * 3)
    @State private var pace = "balanced"
    @State private var collections: [Collection] = []
    @State private var selected: Set<String> = []
    @State private var generate = true
    @State private var error: String?
    @State private var busy = false

    private let fmt: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current; return f }()

    var body: some View {
        NavigationStack {
            Form {
                Section("Destination") {
                    if let p = picked {
                        HStack { Text("📍 \(p.name)\(p.country.map { ", \($0)" } ?? "")"); Spacer(); Button("Change") { picked = nil } }
                    } else {
                        TextField("City, region or country", text: $destination).onSubmit { Task { await search() } }
                        ForEach(results) { r in Button("\(r.name) — \([r.city, r.country].compactMap { $0 }.joined(separator: ", "))") { picked = r; results = [] } }
                    }
                }
                Section("Dates") {
                    DatePicker("Start", selection: $start, displayedComponents: .date)
                    DatePicker("End", selection: $end, in: start..., displayedComponents: .date)
                }
                Section {
                    TextField("Trip name (optional)", text: $name)
                    Picker("Pace", selection: $pace) { ForEach(["relaxed", "balanced", "packed"], id: \.self) { Text($0.capitalized) } }
                }
                if !collections.isEmpty {
                    Section("Include collections") {
                        ForEach(collections) { c in
                            Toggle("\(c.name) (\(c.placeCount))", isOn: Binding(get: { selected.contains(c.id) }, set: { $0 ? selected.insert(c.id) : selected.remove(c.id) }))
                        }
                    }
                }
                Toggle("✨ Suggest an itinerary with AI", isOn: $generate)
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("New trip")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Create") { Task { await create() } }.disabled(busy || (picked == nil && destination.isEmpty)) }
            }
            .task { collections = (try? await APIClient.shared.get("/collections")) ?? [] }
        }
    }

    private func search() async {
        let q = destination.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        results = (try? await APIClient.shared.get("/explore/search?q=\(q)")) ?? []
    }

    private func create() async {
        busy = true
        defer { busy = false }
        let dest = picked.map { [$0.name, $0.country].compactMap { $0 }.joined(separator: ", ") } ?? destination
        let body = JSONBody([
            "name": .string(name.isEmpty ? "Trip to \(picked?.name ?? destination)" : name),
            "destination": .string(dest),
            "destinationLat": .opt(picked?.lat),
            "destinationLng": .opt(picked?.lng),
            "startDate": .string(fmt.string(from: start)),
            "endDate": .string(fmt.string(from: end)),
            "preferences": .object(["interests": .array([]), "pace": .string(pace), "travelMode": .string("walking")]),
            "collectionIds": .array(selected.map { .string($0) }),
        ])
        do {
            let trip: Trip = try await APIClient.shared.post("/trips", body)
            if generate && !selected.isEmpty {
                let _: ItineraryProposal? = try? await APIClient.shared.post("/trips/\(trip.id)/itinerary/generate", JSONBody(["scope": .string("trip")]))
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
