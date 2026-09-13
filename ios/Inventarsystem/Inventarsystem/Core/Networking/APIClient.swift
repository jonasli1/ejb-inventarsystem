import Foundation

/// The single entry point for every REST call. An `actor` on purpose (not a `@MainActor` class):
/// this project defaults unmarked declarations to `@MainActor` isolation
/// (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`), which would silently serialize all networking
/// onto the main thread — an `actor` is its own isolation domain and is exempt from that
/// default, so requests genuinely run off the main actor while still being safely callable from
/// it via `await`.
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private var accessTokenProvider: (@Sendable () async -> String?)?
    /// Attempts a token refresh (coalesced elsewhere); returns whether it succeeded. Wired up
    /// by `AuthSession` at app start so `APIClient` never talks to `TokenRefresher` directly.
    private var refreshTokens: (@Sendable () async -> Bool)?

    /// `session` is injectable (default production session otherwise) so tests can supply a
    /// `URLSession` backed by a stub `URLProtocol` — see `InventarsystemTests`.
    init(session: URLSession = APIClient.makeDefaultSession()) {
        self.session = session
    }

    private static func makeDefaultSession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.httpAdditionalHeaders = ["Accept": "application/json"]
        return URLSession(configuration: configuration)
    }

    func configure(
        accessTokenProvider: @escaping @Sendable () async -> String?,
        refreshTokens: @escaping @Sendable () async -> Bool
    ) {
        self.accessTokenProvider = accessTokenProvider
        self.refreshTokens = refreshTokens
    }

    // MARK: - Health check (outside /api/v1, no auth)

    /// Throws on any failure; a clean return means the configured Base URL is reachable.
    func ping() async throws {
        guard let url = APIConfiguration.healthURL else { throw APIError.invalidBaseURL }
        _ = try await executeRaw(URLRequest(url: url), requiresAuth: false, allowRefreshRetry: false)
    }

    // MARK: - JSON requests, relative to /api/v1

    func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        requiresAuth: Bool = true
    ) async throws -> T {
        let urlRequest = try buildRequest(path: path, method: method, query: query, jsonBody: nil)
        let data = try await executeRaw(urlRequest, requiresAuth: requiresAuth, allowRefreshRetry: requiresAuth)
        return try decode(data)
    }

    func request<T: Decodable, Body: Encodable>(
        _ path: String,
        method: String,
        body: Body,
        query: [URLQueryItem] = [],
        requiresAuth: Bool = true
    ) async throws -> T {
        let payload = try encode(body)
        let urlRequest = try buildRequest(path: path, method: method, query: query, jsonBody: payload)
        let data = try await executeRaw(urlRequest, requiresAuth: requiresAuth, allowRefreshRetry: requiresAuth)
        return try decode(data)
    }

    /// For endpoints that respond `204 No Content` (or any body we don't need to decode).
    func requestVoid(
        _ path: String,
        method: String,
        query: [URLQueryItem] = [],
        requiresAuth: Bool = true
    ) async throws {
        let urlRequest = try buildRequest(path: path, method: method, query: query, jsonBody: nil)
        _ = try await executeRaw(urlRequest, requiresAuth: requiresAuth, allowRefreshRetry: requiresAuth)
    }

    func requestVoid<Body: Encodable>(
        _ path: String,
        method: String,
        body: Body,
        requiresAuth: Bool = true
    ) async throws {
        let payload = try encode(body)
        let urlRequest = try buildRequest(path: path, method: method, query: [], jsonBody: payload)
        _ = try await executeRaw(urlRequest, requiresAuth: requiresAuth, allowRefreshRetry: requiresAuth)
    }

    /// For endpoints that return a raw file body (e.g. `/backup/export`'s gzip stream) rather
    /// than JSON.
    func requestData(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        requiresAuth: Bool = true
    ) async throws -> Data {
        let urlRequest = try buildRequest(path: path, method: method, query: query, jsonBody: nil)
        return try await executeRaw(urlRequest, requiresAuth: requiresAuth, allowRefreshRetry: requiresAuth)
    }

    // MARK: - Multipart upload (attachments)

    func uploadMultipart<T: Decodable>(
        _ path: String,
        fileFieldName: String,
        fileName: String,
        mimeType: String,
        fileData: Data,
        formFields: [String: String] = [:]
    ) async throws -> T {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        for (key, value) in formFields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append(
            "Content-Disposition: form-data; name=\"\(fileFieldName)\"; filename=\"\(fileName)\"\r\n"
                .data(using: .utf8)!
        )
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        guard let apiBase = APIConfiguration.apiV1BaseURL else { throw APIError.invalidBaseURL }
        var request = URLRequest(url: apiBase.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let data = try await executeRaw(request, requiresAuth: true, allowRefreshRetry: true)
        return try decode(data)
    }

    // MARK: - Request building

    private func buildRequest(path: String, method: String, query: [URLQueryItem], jsonBody: Data?) throws -> URLRequest {
        guard let apiBase = APIConfiguration.apiV1BaseURL else { throw APIError.invalidBaseURL }
        var url = apiBase.appendingPathComponent(path)
        if !query.isEmpty {
            guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
                throw APIError.invalidBaseURL
            }
            components.queryItems = query
            guard let composed = components.url else { throw APIError.invalidBaseURL }
            url = composed
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let jsonBody {
            request.httpBody = jsonBody
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    private func encode(_ body: some Encodable) throws -> Data {
        do {
            return try APICoding.encoder.encode(body)
        } catch {
            throw APIError.decoding(underlying: error)
        }
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            return try APICoding.decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(underlying: error)
        }
    }

    // MARK: - Execution, auth header injection, 401 refresh-and-retry-once

    private func executeRaw(_ request: URLRequest, requiresAuth: Bool, allowRefreshRetry: Bool) async throws -> Data {
        var request = request
        if requiresAuth {
            guard let token = await accessTokenProvider?(), !token.isEmpty else {
                throw APIError.unauthorized
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network(underlying: error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.network(underlying: URLError(.badServerResponse))
        }

        if (200..<300).contains(http.statusCode) {
            return data
        }

        // Only ever attempt one refresh-and-retry, and only for calls that carried a bearer
        // token in the first place (never for /auth/login or /auth/refresh themselves, which
        // are always called with requiresAuth: false).
        if http.statusCode == 401, requiresAuth, allowRefreshRetry, let refreshTokens {
            if await refreshTokens() {
                return try await executeRaw(request, requiresAuth: true, allowRefreshRetry: false)
            }
            throw APIError.unauthorized
        }
        if http.statusCode == 401, requiresAuth {
            throw APIError.unauthorized
        }

        if let body = try? APICoding.decoder.decode(BackendErrorBody.self, from: data) {
            throw APIError.server(statusCode: http.statusCode, code: body.code, message: body.message.displayText)
        }
        throw APIError.server(
            statusCode: http.statusCode,
            code: nil,
            message: "Unerwarteter Serverfehler (\(http.statusCode))."
        )
    }
}
