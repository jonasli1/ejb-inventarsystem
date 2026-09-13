import Foundation
import Observation

@MainActor
@Observable
final class LoginViewModel {
    var email = ""
    var password = ""
    private(set) var isLoading = false
    var errorMessage: String?

    private let session: AuthSession

    init(session: AuthSession) {
        self.session = session
    }

    convenience init() {
        self.init(session: .shared)
    }

    var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty && !isLoading
    }

    func loginLocal() async {
        guard canSubmit else { return }
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            try await session.loginLocal(email: email, password: password)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Anmeldung fehlgeschlagen."
        }
    }

    func loginWithChurchTools() async {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            let tokens = try await ChurchToolsAuthCoordinator().signIn()
            try await session.completeLogin(with: tokens)
        } catch OAuthRedirectCoordinator.CoordinatorError.userCancelled {
            // User dismissed the browser sheet — not an error worth surfacing.
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Anmeldung mit ChurchTools fehlgeschlagen."
        }
    }

    func loginWithPasskey() async {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            let tokens = try await PasskeyAuthCoordinator().signIn(email: email.isEmpty ? nil : email)
            try await session.completeLogin(with: tokens)
        } catch PasskeyAuthCoordinator.CoordinatorError.userCancelled {
            // User dismissed the system Passkey sheet — not an error worth surfacing.
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Anmeldung mit Passkey fehlgeschlagen."
        }
    }
}
