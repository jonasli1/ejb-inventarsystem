import AuthenticationServices
import UIKit

/// Generic client-driven OAuth redirect flow via `ASWebAuthenticationSession`, using the
/// iOS 17.4+ `.https(host:path:)` callback (`ASWebAuthenticationSession.Callback`) — this
/// intercepts the redirect before it's ever actually loaded, so no custom URL scheme
/// registration or backend change is needed. Used by both ChurchTools login and the OneDrive
/// backup-connect flow, which are structurally identical: the backend builds an authorization
/// URL containing its own fixed, server-configured `redirect_uri`; the client opens it, then
/// extracts `code` (+ `state`, for ChurchTools) from the intercepted callback and posts it back
/// to the backend itself — the callback call is decoupled from `/start`, so any client holding
/// the code/state pair can complete it.
///
/// **Requires a `webcredentials:<domain>` Associated Domains entry for whatever domain the
/// backend's `redirect_uri` actually points at, with a matching apple-app-site-association
/// served there** — independent developer reports indicate `.https()` callback matching
/// enforces this the same way native Passkey does (see `PasskeyAuthCoordinator`), even though
/// Apple's own documentation doesn't spell it out explicitly. This is the same domain
/// association Passkey needs, so treat it as one shared infra requirement, not two. This code
/// is implemented and reviewed against Apple's current API and the backend's actual
/// `redirect_uri` construction, but has not been end-to-end verified here (no physical device,
/// no control over the real domain's DNS/AASA in this environment) — see the iOS README.
@MainActor
final class OAuthRedirectCoordinator: NSObject, ASWebAuthenticationPresentationContextProviding {
    struct CallbackResult {
        let code: String
        let state: String?
    }

    enum CoordinatorError: LocalizedError {
        case missingRedirectURI
        case userCancelled
        case missingCode

        var errorDescription: String? {
            switch self {
            case .missingRedirectURI: return "Die Rückleitungs-Adresse konnte nicht ermittelt werden."
            case .userCancelled: return "Anmeldung abgebrochen."
            case .missingCode: return "Es wurde kein Autorisierungscode empfangen."
            }
        }
    }

    /// Retained only for the duration of `start(authorizationURL:)` — `ASWebAuthenticationSession`
    /// itself keeps no strong external reference, so this session would otherwise be deallocated
    /// mid-flow.
    private var session: ASWebAuthenticationSession?

    /// Opens `authorizationURL` (exactly as returned by the backend) in a system browser
    /// session, and resolves once the OS intercepts a matching redirect. The host/path to match
    /// are derived from the `redirect_uri` query parameter embedded in `authorizationURL`
    /// itself — never hardcoded, since that value is a per-deployment server config.
    func start(authorizationURL: URL) async throws -> CallbackResult {
        guard let redirect = Self.redirectURIComponents(from: authorizationURL) else {
            throw CoordinatorError.missingRedirectURI
        }

        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authorizationURL,
                callback: .https(host: redirect.host, path: redirect.path)
            ) { callbackURL, error in
                if let error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionErrorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        continuation.resume(throwing: CoordinatorError.userCancelled)
                    } else {
                        continuation.resume(throwing: error)
                    }
                    return
                }
                guard let callbackURL,
                      let items = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems,
                      let code = items.first(where: { $0.name == "code" })?.value
                else {
                    continuation.resume(throwing: CoordinatorError.missingCode)
                    return
                }
                let state = items.first(where: { $0.name == "state" })?.value
                continuation.resume(returning: CallbackResult(code: code, state: state))
            }
            session.presentationContextProvider = self
            // Default (false): reuses an existing Safari session, so a staff member already
            // signed into ChurchTools sails straight through — the right default for a
            // personally-owned device. Not currently exposed as a setting.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            session.start()
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }

    private static func redirectURIComponents(from authorizationURL: URL) -> (host: String, path: String)? {
        guard let items = URLComponents(url: authorizationURL, resolvingAgainstBaseURL: false)?.queryItems,
              let redirectURIString = items.first(where: { $0.name == "redirect_uri" })?.value,
              let redirectURL = URL(string: redirectURIString),
              let host = redirectURL.host
        else { return nil }
        return (host, redirectURL.path)
    }
}
