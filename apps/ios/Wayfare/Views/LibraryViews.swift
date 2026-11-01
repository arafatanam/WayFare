import MapKit
import SwiftUI

struct HomeView: View {
    @State private var showImport = false
    @State private var showNewTrip = false

    var body: some View {
        AsyncContent(load: { try await APIClient.shared.get("/me/home") as HomeData }) { data, reload in
            List {
                Section {
                    HStack {
                        Button { showImport = true } label: { Label("Save a place", systemImage: "plus") }.buttonStyle(.borderedProminent)
                        Button { showNewTrip = true } label: { Label("New trip", systemImage: "airplane") }.buttonStyle(.bordered)
                    }
                }
                if data.counts.places == 0 && data.counts.trips == 0 {
                    ContentUnavailableView("Let's start your first plan", systemImage: "sparkles",
                                           description: Text("Save a place you saw online, or create a trip with a destination and dates."))
                }
                if !data.upcomingTrips.isEmpty {
                    Section("Upcoming trips") {
                        ForEach(data.upcomingTrips) { t in NavigationLink(value: t) { TripRow(trip: t) } }
                    }
                }
                if !data.recentPlaces.isEmpty {
                    Section("Recently saved") {
                        ForEach(data.recentPlaces) { p in NavigationLink(value: p) { PlaceRow(place: p) } }
                    }
                }
            }
            .refreshable { await reload() }
            .sheet(isPresented: $showImport, onDismiss: { Task { await reload() } }) { ImportView() }
            .sheet(isPresented: $showNewTrip, onDismiss: { Task { await reload() } }) { NewTripView() }
        }
        .navigationTitle("Where to next?")
        .navigationDestination(for: Place.self) { PlaceDetailView(placeId: $0.id) }
        .navigationDestination(for: Trip.self) { TripDetailView(tripId: $0.id) }
    }
}

struct ExploreView: View {
    @State private var query = ""
    @State private var results: [GeoResult] = []
    @State private var saved: Set<String> = []

    var body: some View {
        List(results) { r in
            HStack {
                Text(emoji(r.category)).font(.title2)
                VStack(alignment: .leading) {
                    Text(r.name).font(.headline)
                    Text(r.address ?? [r.city, r.country].compactMap { $0 }.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button(saved.contains(r.id) ? "Saved" : "Save") {
                    Task {
                        let body = JSONBody([
                            "name": .string(r.name), "address": .opt(r.address), "city": .opt(r.city), "country": .opt(r.country),
                            "lat": .double(r.lat), "lng": .double(r.lng), "category": .string(r.category),
                            "externalId": .string(r.externalId), "sourcePlatform": .string("search"),
                        ])
                        if (try? await APIClient.shared.post("/places", body) as Place) != nil { saved.insert(r.id) }
                    }
                }
                .buttonStyle(.borderedProminent).disabled(saved.contains(r.id))
            }
        }
        .overlay { if results.isEmpty { ContentUnavailableView("Search for places", systemImage: "magnifyingglass") } }
        .searchable(text: $query, prompt: "Place, landmark or restaurant")
        .task(id: query) {
            guard query.count >= 2 else { results = []; return }
            try? await Task.sleep(for: .milliseconds(400))
            let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
            results = (try? await APIClient.shared.get("/explore/search?q=\(q)")) ?? []
        }
        .navigationTitle("Explore")
    }
}

struct SavedView: View {
    @State private var places: [Place] = []
    @State private var collections: [Collection] = []
    @State private var query = ""
    @State private var showMap = false
    @State private var showImport = false
    @State private var loading = true

    var filtered: [Place] {
        query.isEmpty ? places : places.filter { [$0.name, $0.city ?? "", $0.country ?? ""].joined(separator: " ").localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        Group {
            if showMap {
                Map {
                    ForEach(filtered.filter { $0.lat != nil }) { p in
                        Marker(p.name, coordinate: CLLocationCoordinate2D(latitude: p.lat!, longitude: p.lng!))
                    }
                }
            } else {
                List {
                    if !collections.isEmpty {
                        Section("Collections") {
                            ForEach(collections) { c in
                                NavigationLink(value: c) { LabeledContent(c.name, value: "\(c.placeCount)") }
                            }
                        }
                    }
                    Section("Places") {
                        if !loading && places.isEmpty {
                            ContentUnavailableView("Your library is empty", systemImage: "bookmark",
                                                   description: Text("Paste a link, upload a screenshot or search for a place."))
                        }
                        ForEach(filtered) { p in NavigationLink(value: p) { PlaceRow(place: p) } }
                    }
                }
                .refreshable { await load() }
            }
        }
        .searchable(text: $query, prompt: "Search saved places")
        .toolbar {
            ToolbarItem { Button(showMap ? "List" : "Map") { showMap.toggle() } }
            ToolbarItem { Button { showImport = true } label: { Image(systemName: "plus") } }
        }
        .sheet(isPresented: $showImport, onDismiss: { Task { await load() } }) { ImportView() }
        .navigationTitle("Saved")
        .navigationDestination(for: Place.self) { PlaceDetailView(placeId: $0.id) }
        .navigationDestination(for: Collection.self) { CollectionView(collectionId: $0.id) }
        .task { await load() }
    }

    func load() async {
        async let p: [Place] = APIClient.shared.get("/places")
        async let c: [Collection] = APIClient.shared.get("/collections")
        places = (try? await p) ?? places
        collections = (try? await c) ?? collections
        loading = false
    }
}

struct CollectionView: View {
    let collectionId: String
    var body: some View {
        AsyncContent(load: { try await APIClient.shared.get("/collections/\(collectionId)") as CollectionDetail }) { c, reload in
            List {
                if let d = c.description { Text(d).foregroundStyle(.secondary) }
                ForEach(c.places) { p in NavigationLink(value: p) { PlaceRow(place: p) } }
                    .onDelete { idx in
                        // Removes from this collection only; places stay in the library.
                        Task {
                            for i in idx { let _: Ok? = try? await APIClient.shared.delete("/collections/\(collectionId)/places/\(c.places[i].id)") }
                            await reload()
                        }
                    }
            }
            .navigationTitle(c.name)
        }
    }
}

struct PlaceDetailView: View {
    let placeId: String
    @State private var notes = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        AsyncContent(load: { try await APIClient.shared.get("/places/\(placeId)") as Place }) { place, reload in
            List {
                CoverImage(url: place.imageUrl, emoji: emoji(place.category))
                    .frame(height: 180).clipShape(RoundedRectangle(cornerRadius: 16)).listRowInsets(EdgeInsets())
                Section {
                    Text(place.name).font(.title.bold())
                    if !place.locationLine.isEmpty { Label(place.locationLine, systemImage: "mappin") }
                    if let lat = place.lat, let lng = place.lng {
                        Map(initialPosition: .region(MKCoordinateRegion(center: .init(latitude: lat, longitude: lng), latitudinalMeters: 1500, longitudinalMeters: 1500))) {
                            Marker(place.name, coordinate: .init(latitude: lat, longitude: lng))
                        }
                        .frame(height: 180)
                        Button("Open in Maps") {
                            let item = MKMapItem(placemark: MKPlacemark(coordinate: .init(latitude: lat, longitude: lng)))
                            item.name = place.name
                            item.openInMaps()
                        }
                    }
                    ShareLink(item: "\(place.name) — https://www.google.com/maps/search/?api=1&query=\(place.lat ?? 0),\(place.lng ?? 0)")
                }
                if place.readOnly != true {
                    Section("Your notes (private)") {
                        TextField("What to order, best time to go…", text: $notes, axis: .vertical)
                            .onAppear { notes = place.notes ?? "" }
                        Button("Save notes") {
                            Task {
                                let _: Place? = try? await APIClient.shared.patch("/places/\(place.id)", JSONBody(["notes": notes.isEmpty ? .null : .string(notes)]))
                                await reload()
                            }
                        }
                    }
                    Section {
                        Toggle("Visited", isOn: Binding(get: { place.visited }, set: { v in
                            Task {
                                let _: Place? = try? await APIClient.shared.patch("/places/\(place.id)", JSONBody(["visited": .bool(v)]))
                                await reload()
                            }
                        }))
                    }
                }
                if let ai = place.aiDescription {
                    Section("✨ AI suggestion — may be inaccurate") { Text(ai) }
                }
                if let src = place.sourceUrl, let url = URL(string: src) {
                    Section("Original source") {
                        if let t = place.sourceText { Text(t).italic().foregroundStyle(.secondary) }
                        Link("Open source link", destination: url)
                    }
                }
                if place.readOnly != true {
                    Button("Delete place", role: .destructive) {
                        Task {
                            let _: Ok? = try? await APIClient.shared.delete("/places/\(place.id)")
                            dismiss()
                        }
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
