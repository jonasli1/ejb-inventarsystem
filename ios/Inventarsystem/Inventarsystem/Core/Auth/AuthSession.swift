import Foundation
import Observation

/// The app-wide session/profile/permission store — the Swift analog of the reference
/// frontend's `AuthContext`. `@MainActor` because SwiftUI views read it directly; all network
/// work it triggers happens on the `APIClient`/`TokenRefresher` actors, not here.
@MainActor
@Observable
final class AuthSession {
    enum Status: Equatable {
        /// Deciding what to show first — never rendered for more than a frame.
        case bootstrapping
        /// No Base URL configured yet — show the onboarding screen.
        case needsBaseURL
        /// Base URL known, no valid session — show the login screen.
        case unauthenticated
        case authenticated
    }

    private(set) var status: Status = .bootstrapping
    private(set) var profile: MeResponse?
    private(set) var publicConfig: AppPublicConfig = .fallback

    private var refresher: TokenRefresher?

    static let shared = AuthSession()

    private init() {}

    var permissions: Set<String> { Set(profile?.permissions ?? []) }

    func hasPermission(_ key: String) -> Bool { permissions.contains(key) }
    func hasAnyPermission(_ keys: [String]) -> Bool { keys.contains { permissions.contains($0) } }

    /// Call once at app launch, before showing any UI.
    func bootstrap() async {
        if ProcessInfo.processInfo.environment["RESET_STATE_FOR_UITESTS"] == "1" {
            APIConfiguration.reset()
            KeychainTokenStore.clear()
        }

        await wireUpAPIClient()

        guard APIConfiguration.isConfigured else {
            status = .needsBaseURL
            return
        }

        await refreshPublicConfig()

        guard KeychainTokenStore.load() != nil else {
            status = .unauthenticated
            return
        }

        do {
            profile = try await LoginService.me()
            status = .authenticated
            Task { await StickerProfileStore.shared.refresh() }
        } catch {
            // A stored token that no longer works (revoked, backend reset, ...) — fall back to
            // the login screen rather than getting stuck.
            KeychainTokenStore.clear()
            status = .unauthenticated
        }
    }

    /// Re-fetches `/auth/me` after something that changes it out-of-band (e.g. registering a
    /// passkey, which adds `"passkey"` to `authMethods`). Silently no-ops on failure — the
    /// action that triggered this already reported its own success/failure.
    func refreshProfile() async {
        profile = try? await LoginService.me()
    }

    /// Fetches the public app config (branding, which login methods are available). Never
    /// throws to the caller — falls back to `.fallback` so onboarding/login can't be blocked
    /// by this being unreachable.
    func refreshPublicConfig() async {
        publicConfig = (try? await LoginService.publicConfig()) ?? .fallback
    }

    func loginLocal(email: String, password: String) async throws {
        let tokens = try await LoginService.login(email: email, password: password)
        try await completeLogin(with: tokens)
    }

    /// Shared by every login method (local/ChurchTools/Passkey) once a token pair exists.
    func completeLogin(with tokens: TokenResponse) async throws {
        KeychainTokenStore.save(tokens)
        do {
            profile = try await LoginService.me()
            status = .authenticated
            Task { await StickerProfileStore.shared.refresh() }
        } catch {
            KeychainTokenStore.clear()
            throw error
        }
    }

    func logout() async {
        if let refreshToken = KeychainTokenStore.load()?.refreshToken {
            try? await LoginService.logout(refreshToken: refreshToken)
        }
        KeychainTokenStore.clear()
        profile = nil
        status = .unauthenticated
    }

    /// Called once during first-run onboarding, after the Base URL has passed format
    /// validation and a live health-check ping.
    func finishOnboarding(baseURL: URL) async {
        APIConfiguration.baseURL = baseURL
        await refreshPublicConfig()
        status = .unauthenticated
    }

    /// Called from Settings. Tokens are bound to one backend instance, so changing the Base
    /// URL always discards them and forces a fresh sign-in.
    func changeBaseURL(to url: URL) async {
        APIConfiguration.baseURL = url
        KeychainTokenStore.clear()
        await ImageCache.shared.clear()
        profile = nil
        status = .unauthenticated
        await refreshPublicConfig()
    }

    private func wireUpAPIClient() async {
        let refresher = TokenRefresher { refreshToken in
            try? await LoginService.refresh(refreshToken: refreshToken)
        }
        self.refresher = refresher
        await APIClient.shared.configure(
            accessTokenProvider: { KeychainTokenStore.load()?.accessToken },
            refreshTokens: { await refresher.refresh() }
        )
        await ImageCache.shared.configure(accessTokenProvider: { KeychainTokenStore.load()?.accessToken })
    }
}
