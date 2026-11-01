import PhotosUI
import SuperwallKit
import SwiftUI

struct ImportView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var mode = "link"
    @State private var url = ""
    @State private var text = ""
    @State private var photo: PhotosPickerItem?
    @State private var job: ImportJob?
    @State private var selected: Set<Int> = []
    @State private var manualName = ""
    @State private var manualCity = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if let job {
                    review(job)
                } else {
                    Picker("Method", selection: $mode) {
                        Text("Link").tag("link"); Text("Screenshot").tag("screenshot"); Text("Search").tag("search"); Text("Manual").tag("manual")
                    }
                    .pickerStyle(.segmented)
                    switch mode {
                    case "link":
                        Section(footer: Text("Instagram, TikTok, Google Maps or any travel article.")) {
                            TextField("https://", text: $url).keyboardType(.URL).textInputAutocapitalization(.never)
                            Button("Find places") { Task { await start { try await APIClient.shared.post("/imports", JSONBody(["type": .string("url"), "url": .string(url)])) } } }
                                .disabled(url.isEmpty || busy)
                        }
                    case "screenshot":
                        PhotosPicker("Choose a screenshot", selection: $photo, matching: .screenshots)
                            .onChange(of: photo) { _, item in
                                guard let item else { return }
                                Task {
                                    await start {
                                        guard let data = try await item.loadTransferable(type: Data.self),
                                              let jpeg = UIImage(data: data)?.jpegData(compressionQuality: 0.8) else { throw APIError.http(400, "Couldn't read that image") }
                                        return try await APIClient.shared.uploadScreenshot(jpeg)
                                    }
                                }
                            }
                    case "search":
                        TextField("Place name", text: $text)
                        Button("Search") { Task { await start { try await APIClient.shared.post("/imports", JSONBody(["type": .string("text"), "text": .string(text)])) } } }
                            .disabled(text.count < 2 || busy)
                    default:
                        TextField("Name", text: $manualName)
                        TextField("City", text: $manualCity)
                        Button("Save place") {
                            Task {
                                do {
                                    let _: Place = try await APIClient.shared.post("/places", JSONBody([
                                        "name": .string(manualName), "city": manualCity.isEmpty ? .null : .string(manualCity), "sourcePlatform": .string("manual"),
                                    ]))
                                    dismiss()
                                } catch { self.error = error.localizedDescription }
                            }
                        }
                        .disabled(manualName.isEmpty)
                    }
                }
                if busy { ProgressView() }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Save a place")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }

    @ViewBuilder
    private func review(_ job: ImportJob) -> some View {
        switch job.status {
        case "queued", "processing":
            HStack { ProgressView(); Text("Looking for places…") }
                .task {
                    while self.job?.status == "queued" || self.job?.status == "processing" {
                        try? await Task.sleep(for: .seconds(2))
                        self.job = try? await APIClient.shared.get("/imports/\(job.id)")
                    }
                    if let j = self.job { selected = Set(j.candidates.indices.filter { j.candidates[$0].confidence >= 0.6 || j.candidates.count == 1 }) }
                }
        case "failed":
            Section {
                Text("We couldn't extract a place automatically.").bold()
                Text(job.error ?? "")
                Button("Add manually") { self.job = nil; mode = "manual" }
            }
        default:
            Section("Review what we found") {
                ForEach(Array(job.candidates.enumerated()), id: \.offset) { i, c in
                    Toggle(isOn: Binding(get: { selected.contains(i) }, set: { $0 ? selected.insert(i) : selected.remove(i) })) {
                        VStack(alignment: .leading) {
                            Text("\(emoji(c.category)) \(c.name)")
                            Text(c.lat != nil ? (c.address ?? c.city ?? "") : "Location not found").font(.caption).foregroundStyle(.secondary)
                            if c.confidence < 0.6 { Text("Unsure").font(.caption.bold()).foregroundStyle(.orange) }
                        }
                    }
                }
            }
            Button("Save \(selected.count) place\(selected.count == 1 ? "" : "s")") {
                Task {
                    let places: [JSONValue] = selected.sorted().map { i in
                        let c = job.candidates[i]
                        return .object([
                            "name": .string(c.name), "address": .opt(c.address), "city": .opt(c.city), "country": .opt(c.country),
                            "lat": .opt(c.lat), "lng": .opt(c.lng), "category": .string(c.category), "externalId": .opt(c.externalId),
                        ])
                    }
                    do {
                        let _: [Place] = try await APIClient.shared.post("/imports/\(job.id)/confirm", JSONBody(["places": .array(places)]))
                        dismiss()
                    } catch { self.error = error.localizedDescription }
                }
            }
            .disabled(selected.isEmpty)
        }
    }

    private func start(_ fn: () async throws -> ImportJob) async {
        busy = true
        defer { busy = false }
        do { job = try await fn() } catch { self.error = error.localizedDescription }
    }
}

struct ProfileView: View {
    @EnvironmentObject var api: APIClient
    @State private var me: Me?
    @State private var confirmDelete = false

    var body: some View {
        List {
            if let me {
                Section("Account") {
                    LabeledContent("Name", value: me.name)
                    LabeledContent("Email", value: me.email + (me.emailVerified ? " ✓" : ""))
                }
                Section("Plan") {
                    LabeledContent("Current plan", value: me.plan == "pro" ? "Pro" : "Free")
                    Text("\(me.usage.aiGenerations)/\(me.usage.limits.aiGenerationsPerMonth) AI itineraries · \(me.usage.imports)/\(me.usage.limits.importsPerMonth) imports this month")
                        .font(.caption)
                    if me.plan == "free" {
                        // Superwall presents the paywall for this placement; purchases sync to the API via webhook.
                        Button("Upgrade to Pro") { Superwall.shared.register(placement: "upgrade") }
                    }
                }
                Section("Privacy") {
                    Link("Privacy policy", destination: api.baseURL.appendingPathComponent("privacy"))
                    Button("Delete account", role: .destructive) { confirmDelete = true }
                }
                Button("Sign out") { Task { await api.signOut() } }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Profile")
        .task {
            me = try? await api.get("/me")
            if let id = me?.id { Superwall.shared.identify(userId: id) }
        }
        .confirmationDialog("Delete your account? This permanently deletes your places, collections and trips you own.", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete account", role: .destructive) {
                Task {
                    let _: Ok? = try? await api.post("/auth/delete-user")
                    await api.signOut()
                }
            }
        }
    }
}
