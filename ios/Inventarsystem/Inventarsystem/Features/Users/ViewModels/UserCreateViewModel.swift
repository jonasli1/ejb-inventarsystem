import Foundation
import Observation

@MainActor
@Observable
final class UserCreateViewModel {
    var email = ""
    var displayName = ""
    /// When `false`, `password` is never sent — the account is SSO-only (ChurchTools/Passkey)
    /// until someone explicitly sets a password later via "Passwort zurücksetzen".
    var setsPassword = false
    var password = ""
    private(set) var isSaving = false
    var errorMessage: String?

    private let service: UserServicing

    init(service: UserServicing = UserService()) {
        self.service = service
    }

    var canSave: Bool {
        !email.isEmpty && !displayName.isEmpty && (!setsPassword || password.count >= 8) && !isSaving
    }

    func save() async -> User? {
        isSaving = true
        defer { isSaving = false }
        do {
            return try await service.create(email: email, displayName: displayName, password: setsPassword ? password : nil)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Person konnte nicht angelegt werden."
            return nil
        }
    }
}
