import Foundation

/// Thin adapter over `/auth/*` and the public `/settings/general` config. Holds no state of
/// its own — just forwards to the `APIClient` actor — so it stays a plain `enum` of static
/// functions rather than a class/actor.
enum LoginService {
    private struct LoginRequest: Encodable { let email: String; let password: String }
    private struct RefreshRequest: Encodable { let refreshToken: String }
    private struct LogoutRequest: Encodable { let refreshToken: String }
    private struct ChangePasswordRequest: Encodable {
        let currentPassword: String
        let newPassword: String
        let newPasswordConfirmation: String
    }
    private struct ForgotPasswordRequest: Encodable { let email: String }
    private struct ResetPasswordRequest: Encodable {
        let token: String
        let newPassword: String
        let newPasswordConfirmation: String
    }
    private struct ThemeRequest: Encodable { let theme: String }
    private struct AvailabilityResponse: Decodable { let available: Bool }

    static func login(email: String, password: String) async throws -> TokenResponse {
        try await APIClient.shared.request(
            "auth/login",
            method: "POST",
            body: LoginRequest(email: email, password: password),
            requiresAuth: false
        )
    }

    static func refresh(refreshToken: String) async throws -> TokenResponse {
        try await APIClient.shared.request(
            "auth/refresh",
            method: "POST",
            body: RefreshRequest(refreshToken: refreshToken),
            requiresAuth: false
        )
    }

    static func logout(refreshToken: String) async throws {
        try await APIClient.shared.requestVoid(
            "auth/logout",
            method: "POST",
            body: LogoutRequest(refreshToken: refreshToken),
            requiresAuth: false
        )
    }

    static func me() async throws -> MeResponse {
        try await APIClient.shared.request("auth/me")
    }

    static func changePassword(current: String, new: String, confirmation: String) async throws {
        try await APIClient.shared.requestVoid(
            "auth/change-password",
            method: "POST",
            body: ChangePasswordRequest(currentPassword: current, newPassword: new, newPasswordConfirmation: confirmation)
        )
    }

    static func setTheme(_ theme: String) async throws {
        try await APIClient.shared.requestVoid("auth/theme", method: "PUT", body: ThemeRequest(theme: theme))
    }

    static func isPasswordResetAvailable() async throws -> Bool {
        let response: AvailabilityResponse = try await APIClient.shared.request(
            "auth/password-reset-available",
            requiresAuth: false
        )
        return response.available
    }

    static func forgotPassword(email: String) async throws {
        try await APIClient.shared.requestVoid(
            "auth/forgot-password",
            method: "POST",
            body: ForgotPasswordRequest(email: email),
            requiresAuth: false
        )
    }

    static func resetPassword(token: String, new: String, confirmation: String) async throws {
        try await APIClient.shared.requestVoid(
            "auth/reset-password",
            method: "POST",
            body: ResetPasswordRequest(token: token, newPassword: new, newPasswordConfirmation: confirmation),
            requiresAuth: false
        )
    }

    static func publicConfig() async throws -> AppPublicConfig {
        try await APIClient.shared.request("settings/general", requiresAuth: false)
    }

    // MARK: - ChurchTools OAuth (client-driven — see `OAuthRedirectCoordinator`)

    struct ChurchToolsStartResponse: Decodable { let authorizationUrl: String; let state: String }

    static func churchToolsStart() async throws -> ChurchToolsStartResponse {
        try await APIClient.shared.request("auth/churchtools/start", requiresAuth: false)
    }

    static func churchToolsCallback(code: String, state: String) async throws -> TokenResponse {
        try await APIClient.shared.request(
            "auth/churchtools/callback",
            query: [URLQueryItem(name: "code", value: code), URLQueryItem(name: "state", value: state)],
            requiresAuth: false
        )
    }

    // MARK: - Passkey / WebAuthn

    struct PasskeyChallengeResponse: Decodable { let challengeId: String; let options: JSONValue }
    private struct PasskeyLoginOptionsRequest: Encodable { let email: String? }
    private struct PasskeyVerifyRequest: Encodable { let challengeId: String; let response: JSONValue }
    private struct PasskeyRegisterVerifyRequest: Encodable { let challengeId: String; let response: JSONValue; let deviceLabel: String? }

    static func passkeyRegistrationOptions() async throws -> PasskeyChallengeResponse {
        try await APIClient.shared.request("auth/passkey/register/options", method: "POST")
    }

    static func passkeyRegistrationVerify(challengeId: String, response: JSONValue, deviceLabel: String?) async throws {
        try await APIClient.shared.requestVoid(
            "auth/passkey/register/verify", method: "POST",
            body: PasskeyRegisterVerifyRequest(challengeId: challengeId, response: response, deviceLabel: deviceLabel)
        )
    }

    static func passkeyLoginOptions(email: String?) async throws -> PasskeyChallengeResponse {
        try await APIClient.shared.request(
            "auth/passkey/login/options", method: "POST", body: PasskeyLoginOptionsRequest(email: email), requiresAuth: false
        )
    }

    static func passkeyLoginVerify(challengeId: String, response: JSONValue) async throws -> TokenResponse {
        try await APIClient.shared.request(
            "auth/passkey/login/verify", method: "POST",
            body: PasskeyVerifyRequest(challengeId: challengeId, response: response), requiresAuth: false
        )
    }
}
