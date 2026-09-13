import AuthenticationServices
import UIKit

/// Bridges the backend's WebAuthn JSON contract (`@simplewebauthn/server`) to Apple's native
/// `ASAuthorizationPlatformPublicKeyCredentialProvider`. Property/method names below verified
/// directly against the AuthenticationServices framework headers (not guessed): the request
/// classes conform to `ASAuthorizationPublicKeyCredentialRegistrationRequest`/
/// `AssertionRequest` (challenge, relyingPartyIdentifier, userID, name, displayName,
/// allowedCredentials), and the result classes conform to `ASPublicKeyCredential`
/// (credentialID, rawClientDataJSON) plus `...Registration` (rawAttestationObject) or
/// `...Assertion` (rawAuthenticatorData, userID, signature).
///
/// **Requires the same `webcredentials:<domain>` Associated Domains + apple-app-site-
/// association as the ChurchTools `.https()` callback** (see `OAuthRedirectCoordinator`) — a
/// hard Apple platform requirement with no client-side workaround. `relyingPartyIdentifier` is
/// derived at runtime from the configured Base URL's host, matching the backend's own dynamic
/// `WEBAUTHN_RP_ID`, so this code is correct as soon as that prerequisite is met; it has not
/// been end-to-end verified here (no physical device, no control over the real domain's DNS/
/// AASA in this environment) — see the iOS README.
@MainActor
final class PasskeyAuthCoordinator: NSObject {
    enum CoordinatorError: LocalizedError {
        case noRelyingPartyIdentifier
        case unexpectedCredentialType
        case userCancelled
        case missingChallenge

        var errorDescription: String? {
            switch self {
            case .noRelyingPartyIdentifier: return "Die Server-Adresse ist nicht konfiguriert."
            case .unexpectedCredentialType: return "Unerwarteter Anmeldetyp erhalten."
            case .userCancelled: return "Passkey-Vorgang abgebrochen."
            case .missingChallenge: return "Es wurde keine gültige Anfrage vom Server empfangen."
            }
        }
    }

    private var continuation: CheckedContinuation<ASAuthorization, Error>?

    /// Registers a new platform passkey for the currently signed-in user and confirms it with
    /// the backend. `deviceLabel` is shown later when the user manages their passkeys.
    func registerPasskey(deviceLabel: String?) async throws {
        let challengeResponse = try await LoginService.passkeyRegistrationOptions()
        let options = challengeResponse.options
        guard let rpId = RelyingPartyIdentifier.current else { throw CoordinatorError.noRelyingPartyIdentifier }
        guard
            let challengeString = options["challenge"]?.stringValue,
            let challenge = Data(base64URLEncoded: challengeString),
            let userIdString = options["user"]?["id"]?.stringValue,
            let userId = Data(base64URLEncoded: userIdString),
            let userName = options["user"]?["name"]?.stringValue
        else { throw CoordinatorError.missingChallenge }

        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: userName, userID: userId)
        if let displayName = options["user"]?["displayName"]?.stringValue {
            request.displayName = displayName
        }

        let authorization = try await perform([request])
        guard let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration else {
            throw CoordinatorError.unexpectedCredentialType
        }

        let response = JSONValue.object([
            "clientDataJSON": .string(credential.rawClientDataJSON.base64URLEncodedString()),
            "attestationObject": .string((credential.rawAttestationObject ?? Data()).base64URLEncodedString())
        ])
        let fullResponse = JSONValue.object([
            "id": .string(credential.credentialID.base64URLEncodedString()),
            "rawId": .string(credential.credentialID.base64URLEncodedString()),
            "type": .string("public-key"),
            "clientExtensionResults": .object([:]),
            "response": response
        ])

        try await LoginService.passkeyRegistrationVerify(
            challengeId: challengeResponse.challengeId, response: fullResponse, deviceLabel: deviceLabel
        )
    }

    /// Signs in with an existing platform passkey. `email` narrows the request to that
    /// account's credentials; pass `nil` for a discoverable/usernameless login (the system
    /// account picker decides).
    func signIn(email: String?) async throws -> TokenResponse {
        let challengeResponse = try await LoginService.passkeyLoginOptions(email: email)
        let options = challengeResponse.options
        guard let rpId = RelyingPartyIdentifier.current else { throw CoordinatorError.noRelyingPartyIdentifier }
        guard
            let challengeString = options["challenge"]?.stringValue,
            let challenge = Data(base64URLEncoded: challengeString)
        else { throw CoordinatorError.missingChallenge }

        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)

        if case .array(let allowCredentials)? = options["allowCredentials"] {
            request.allowedCredentials = allowCredentials.compactMap { entry -> ASAuthorizationPlatformPublicKeyCredentialDescriptor? in
                guard let idString = entry["id"]?.stringValue, let idData = Data(base64URLEncoded: idString) else { return nil }
                return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: idData)
            }
        }

        let authorization = try await perform([request])
        guard let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            throw CoordinatorError.unexpectedCredentialType
        }

        let response = JSONValue.object([
            "clientDataJSON": .string(credential.rawClientDataJSON.base64URLEncodedString()),
            "authenticatorData": .string(credential.rawAuthenticatorData.base64URLEncodedString()),
            "signature": .string(credential.signature.base64URLEncodedString()),
            "userHandle": .string(credential.userID.base64URLEncodedString())
        ])
        let fullResponse = JSONValue.object([
            "id": .string(credential.credentialID.base64URLEncodedString()),
            "rawId": .string(credential.credentialID.base64URLEncodedString()),
            "type": .string("public-key"),
            "clientExtensionResults": .object([:]),
            "response": response
        ])

        return try await LoginService.passkeyLoginVerify(challengeId: challengeResponse.challengeId, response: fullResponse)
    }

    private func perform(_ requests: [ASAuthorizationRequest]) async throws -> ASAuthorization {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: requests)
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }
}

extension PasskeyAuthCoordinator: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        MainActor.assumeIsolated {
            continuation?.resume(returning: authorization)
            continuation = nil
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        MainActor.assumeIsolated {
            let nsError = error as NSError
            if nsError.domain == ASAuthorizationError.errorDomain, nsError.code == ASAuthorizationError.canceled.rawValue {
                continuation?.resume(throwing: CoordinatorError.userCancelled)
            } else {
                continuation?.resume(throwing: error)
            }
            continuation = nil
        }
    }
}

extension PasskeyAuthCoordinator: ASAuthorizationControllerPresentationContextProviding {
    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
