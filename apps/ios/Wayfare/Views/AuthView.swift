import SwiftUI

struct AuthView: View {
    @EnvironmentObject var api: APIClient
    @State private var isSignUp = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Wayfare").font(.largeTitle.bold()).foregroundStyle(Color.brand)
                        Text("From saved posts to a real itinerary.").foregroundStyle(.secondary)
                    }
                    .listRowBackground(Color.clear)
                }
                Section {
                    if isSignUp { TextField("Name", text: $name).textContentType(.name) }
                    TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    SecureField("Password", text: $password).textContentType(isSignUp ? .newPassword : .password)
                }
                if let error { Text(error).foregroundStyle(.red) }
                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        HStack { Spacer(); if busy { ProgressView() } else { Text(isSignUp ? "Create account" : "Sign in").bold() }; Spacer() }
                    }
                    .disabled(busy || email.isEmpty || password.isEmpty || (isSignUp && name.isEmpty))
                    Button(isSignUp ? "I already have an account" : "New here? Create an account") { isSignUp.toggle() }
                }
            }
        }
    }

    private func submit() async {
        if isSignUp && password.count < 8 { error = "Use at least 8 characters for your password."; return }
        busy = true
        defer { busy = false }
        do {
            if isSignUp { try await api.signUp(name: name, email: email, password: password) }
            else { try await api.signIn(email: email, password: password) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
