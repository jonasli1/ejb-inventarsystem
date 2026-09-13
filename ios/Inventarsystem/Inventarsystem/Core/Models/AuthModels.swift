import Foundation

/// `POST /auth/login`, `/auth/refresh` response — verified against a live instance.
nonisolated struct TokenResponse: Decodable, Sendable {
    let accessToken: String
    let refreshToken: String
    let tokenType: String
    /// Access token lifetime in seconds (server-configured; do not assume the documented
    /// 15-minute default).
    let expiresIn: Int
}

nonisolated struct RoleSummary: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
}

nonisolated struct GroupMembershipSummary: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
    /// `"churchtools"` or `"manual"` — manual memberships are never touched by the
    /// ChurchTools login sync.
    let source: String
}

/// `GET /auth/me` — the full session profile, verified against a live instance.
nonisolated struct MeResponse: Decodable, Sendable {
    let id: String
    let email: String
    let displayName: String
    let isActive: Bool
    let themePreference: String
    let createdAt: Date
    let authMethods: [String]
    let roles: [RoleSummary]
    let permissions: [String]
    let groups: [GroupMembershipSummary]
}

/// `GET /settings/general` — public, unauthenticated; used to skin the login screen and decide
/// whether to show the ChurchTools/Passkey buttons. Verified field set against a live instance
/// (both an admin-toggle `...Enabled` and a computed `...Available` flag exist for each method;
/// the UI should gate on `...Available`, matching the frontend).
nonisolated struct AppPublicConfig: Decodable, Sendable {
    let displayName: String
    let logoDataUrl: String?
    let churchToolsEnabled: Bool
    let churchToolsAvailable: Bool
    let passkeyEnabled: Bool
    let passkeyAvailable: Bool

    static let fallback = AppPublicConfig(
        displayName: "Inventarsystem",
        logoDataUrl: nil,
        churchToolsEnabled: false,
        churchToolsAvailable: false,
        passkeyEnabled: false,
        passkeyAvailable: false
    )
}
