import Foundation

/// Derives the WebAuthn relying-party identifier from the configured Base URL's host, matching
/// the backend's own dynamic `WEBAUTHN_RP_ID` design (it, too, is just "the production domain",
/// not hardcoded). Native platform Passkeys additionally require this exact domain to carry a
/// `webcredentials:<domain>` Associated Domains entry with a matching apple-app-site-association
/// served there — see `PasskeyAuthCoordinator` and the iOS README.
nonisolated enum RelyingPartyIdentifier {
    static var current: String? {
        APIConfiguration.baseURL?.host
    }
}
