import Foundation

/// Drives the client-side half of the ChurchTools OAuth2 flow — see `OAuthRedirectCoordinator`
/// for the mechanics and the Associated Domains caveat. The backend does all PKCE/state
/// bookkeeping server-side; this just opens the URL it hands back and relays the resulting
/// code+state to the callback endpoint.
@MainActor
final class ChurchToolsAuthCoordinator {
    enum CoordinatorError: LocalizedError {
        case invalidAuthorizationURL
        case stateMismatch

        var errorDescription: String? {
            switch self {
            case .invalidAuthorizationURL: return "Die Anmelde-Adresse von ChurchTools ist ungültig."
            case .stateMismatch: return "Die Anmeldung konnte nicht bestätigt werden. Bitte erneut versuchen."
            }
        }
    }

    private let redirectCoordinator = OAuthRedirectCoordinator()

    /// Runs the full flow and returns a token pair; the caller (e.g. `LoginViewModel`) still
    /// owns calling `AuthSession.completeLogin(with:)`.
    func signIn() async throws -> TokenResponse {
        let start = try await LoginService.churchToolsStart()
        guard let authorizationURL = URL(string: start.authorizationUrl) else {
            throw CoordinatorError.invalidAuthorizationURL
        }
        let callback = try await redirectCoordinator.start(authorizationURL: authorizationURL)
        guard let state = callback.state, state == start.state else {
            throw CoordinatorError.stateMismatch
        }
        return try await LoginService.churchToolsCallback(code: callback.code, state: state)
    }
}
