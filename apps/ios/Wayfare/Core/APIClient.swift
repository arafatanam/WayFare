import Foundation
import Security

enum APIError: LocalizedError {
    case http(Int, String)
    case network
    var errorDescription: String? {
        switch self {
        case .http(_, let msg): return msg
        case .network: return "Can't reach the server. Check your connection."
        }
    }
}

/// Session token storage in the Keychain (never UserDefaults).
enum Keychain {
    private static let service = "com.wayfare.session"
    static func save(_ token: String?) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
        SecItemDelete(query as CFDictionary)
        guard let token, let data = token.data(using: .utf8) else { return }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }
    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

/// Talks to the Cloudflare Worker API using Better Auth bearer tokens.
@MainActor
final class APIClient: ObservableObject {
    static let shared = APIClient()
    let baseURL: URL = URL(string: Bundle.main.object(forInfoDictionaryKey: "WayfareAPIURL") as? String ?? "http://localhost:8787")!
    @Published private(set) var token: String? = Keychain.load()
    /// DEV MODE: Info.plist WayfareDevMode = true skips sign-in; the local API (DEV_MODE=true) uses its test user.
    let devMode = Bundle.main.object(forInfoDictionaryKey: "WayfareDevMode") as? Bool ?? false
    var isSignedIn: Bool { token != nil || devMode }

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    func request<T: Decodable>(_ method: String, _ path: String, body: Encodable? = nil) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent("api" + path))
        req.httpMethod = method
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(AnyEncodable(body))
        }
        return try await send(req)
    }

    func get<T: Decodable>(_ path: String) async throws -> T { try await request("GET", path) }
    func post<T: Decodable>(_ path: String, _ body: Encodable = [String: String]()) async throws -> T { try await request("POST", path, body: body) }
    func patch<T: Decodable>(_ path: String, _ body: Encodable) async throws -> T { try await request("PATCH", path, body: body) }
    func put<T: Decodable>(_ path: String, _ body: Encodable) async throws -> T { try await request("PUT", path, body: body) }
    func delete<T: Decodable>(_ path: String) async throws -> T { try await request("DELETE", path) }

    private func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        do { (data, response) = try await URLSession.shared.data(for: req) } catch { throw APIError.network }
        let http = response as! HTTPURLResponse
        if http.statusCode == 401, !(req.url?.path.contains("/auth/") ?? false) { setToken(nil) }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.message ?? "Request failed (\(http.statusCode))"
            throw APIError.http(http.statusCode, msg)
        }
        return try decoder.decode(T.self, from: data)
    }

    // MARK: Auth

    func signIn(email: String, password: String) async throws {
        try await auth("/sign-in/email", ["email": email, "password": password])
    }
    func signUp(name: String, email: String, password: String) async throws {
        try await auth("/sign-up/email", ["name": name, "email": email, "password": password])
    }
    func signOut() async {
        let _: Ok? = try? await post("/auth/sign-out")
        setToken(nil)
    }

    private func auth(_ path: String, _ body: [String: String]) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/auth" + path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("wayfare://", forHTTPHeaderField: "Origin")
        req.httpBody = try encoder.encode(body)
        let (data, response) = try await URLSession.shared.data(for: req)
        let http = response as! HTTPURLResponse
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.message ?? "Authentication failed"
            throw APIError.http(http.statusCode, msg)
        }
        let token = http.value(forHTTPHeaderField: "set-auth-token") ?? (try? JSONDecoder().decode(TokenBody.self, from: data))?.token
        guard let token else { throw APIError.http(500, "No session returned") }
        setToken(token)
    }

    private func setToken(_ t: String?) {
        token = t
        Keychain.save(t)
    }

    func uploadScreenshot(_ jpeg: Data) async throws -> ImportJob {
        let boundary = UUID().uuidString
        var req = URLRequest(url: baseURL.appendingPathComponent("api/imports/screenshot"))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        var body = Data()
        body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"screenshot.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(jpeg)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        req.httpBody = body
        return try await send(req)
    }

    func mediaURL(_ s: String?) -> URL? {
        guard let s else { return nil }
        return s.hasPrefix("/") ? baseURL.appendingPathComponent(String(s.dropFirst())) : URL(string: s)
    }
}

struct Ok: Decodable {}
private struct ErrorBody: Decodable {
    let message: String?
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        if let e = try? c.nestedContainer(keyedBy: Keys.self, forKey: .error) {
            message = try? e.decode(String.self, forKey: .message)
        } else {
            message = try? c.decode(String.self, forKey: .message)
        }
    }
    enum Keys: String, CodingKey { case error, message }
}
private struct TokenBody: Decodable { let token: String? }

struct AnyEncodable: Encodable {
    let value: Encodable
    init(_ value: Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}

/// Small helper for ad-hoc JSON bodies with mixed value types.
struct JSONBody: Encodable {
    let values: [String: JSONValue]
    init(_ values: [String: JSONValue]) { self.values = values }
    func encode(to encoder: Encoder) throws { try values.encode(to: encoder) }
}

enum JSONValue: Encodable {
    case string(String), int(Int), double(Double), bool(Bool), null, array([JSONValue]), object([String: JSONValue])
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .int(let v): try c.encode(v)
        case .double(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
}

extension JSONValue {
    static func opt(_ s: String?) -> JSONValue { s.map { .string($0) } ?? .null }
    static func opt(_ d: Double?) -> JSONValue { d.map { .double($0) } ?? .null }
}
