import Foundation

/// Stores and validates the user-configured Base URL of the backend REST API.
///
/// The Base URL is not secret, so it lives in `UserDefaults` (never the Keychain, which is
/// reserved for tokens). Users may type either the bare origin (`https://ejb.lindner.app`) or
/// the full API path (`https://ejb.lindner.app/api/v1`) — both are normalized to the same origin.
nonisolated enum APIConfiguration {
    private static let userDefaultsKey = "baseURL"
    private static let apiPathComponent = "api/v1"
    private static let healthPathComponent = "health"

    static var baseURL: URL? {
        get {
            guard let raw = UserDefaults.standard.string(forKey: userDefaultsKey) else { return nil }
            return URL(string: raw)
        }
        set {
            UserDefaults.standard.set(newValue?.absoluteString, forKey: userDefaultsKey)
        }
    }

    static var isConfigured: Bool { normalizedBaseURL != nil }

    /// Base URL for every `/api/v1/...` call.
    static var apiV1BaseURL: URL? {
        normalizedBaseURL?.appendingPathComponent(apiPathComponent)
    }

    /// The unauthenticated health-check endpoint. Confirmed empirically to live *under* the
    /// `/api/v1` prefix (`GET /api/v1/health`), not at a bare `/health` as its Swagger-exclusion
    /// might suggest — a bare `/health` 404s.
    static var healthURL: URL? {
        apiV1BaseURL?.appendingPathComponent(healthPathComponent)
    }

    /// The bare origin (no `/api/v1`). `Attachment.thumbnailUrl`/`mediumUrl` are server-returned
    /// paths that **already include** the `/api/v1` prefix themselves (confirmed against a live
    /// instance, e.g. `/api/v1/attachments/<id>/thumbnail`) — resolve them against this, never
    /// against `apiV1BaseURL`, or the prefix doubles (exactly the bug a past frontend commit,
    /// `f2f4533`, had to fix on the web side).
    static var originURL: URL? {
        normalizedBaseURL
    }

    /// Clears the stored Base URL. Callers are responsible for also clearing tokens (see
    /// `AuthSession.changeBaseURL`), since tokens are bound to one backend instance.
    static func reset() {
        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
    }

    /// Validates and normalizes raw user input into a URL, without making any network call.
    /// Accepts a bare host, a host with scheme, or a full `.../api/v1` path; adds `https://`
    /// when no scheme was typed. Returns `nil` for anything that isn't a plausible HTTP(S) URL.
    static func validateFormat(_ raw: String) -> URL? {
        var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if !trimmed.contains("://") {
            trimmed = "https://" + trimmed
        }
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host,
              !host.isEmpty
        else {
            return nil
        }
        return url
    }

    /// Strips a trailing `/api/v1` (however the user typed it) and any trailing slash, so
    /// `apiV1BaseURL`/`healthURL` always build from the same bare origin.
    private static var normalizedBaseURL: URL? {
        guard let url = baseURL else { return nil }
        var path = url.path
        while path.hasSuffix("/") { path.removeLast() }
        if path.hasSuffix("/\(apiPathComponent)") {
            path.removeLast(apiPathComponent.count + 1)
        }
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        components.path = path
        return components.url ?? url
    }
}
