import SuperwallKit
import SwiftUI

@main
struct WayfareApp: App {
    @StateObject private var api = APIClient.shared

    init() {
        if let key = Bundle.main.object(forInfoDictionaryKey: "SuperwallAPIKey") as? String, !key.isEmpty {
            Superwall.configure(apiKey: key)
        }
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if api.isSignedIn {
                    RootTabs()
                } else {
                    AuthView()
                }
            }
            .environmentObject(api)
            .tint(.brand)
        }
    }
}

extension Color {
    static let brand = Color(red: 15 / 255, green: 118 / 255, blue: 110 / 255)
    static let brandSoft = Color(red: 240 / 255, green: 253 / 255, blue: 250 / 255)
}

struct RootTabs: View {
    var body: some View {
        TabView {
            NavigationStack { HomeView() }.tabItem { Label("Home", systemImage: "house") }
            NavigationStack { ExploreView() }.tabItem { Label("Explore", systemImage: "safari") }
            NavigationStack { SavedView() }.tabItem { Label("Saved", systemImage: "bookmark") }
            NavigationStack { TripsView() }.tabItem { Label("Trips", systemImage: "airplane") }
            NavigationStack { ProfileView() }.tabItem { Label("Profile", systemImage: "person") }
        }
    }
}
