import Foundation
import Observation

@MainActor
@Observable
final class ProfileViewModel {
    var theme: String = "system"
    private(set) var isSavingTheme = false
    private(set) var isRegisteringPasskey = false
    private(set) var notificationPreferences: [NotificationPreference] = []
    private(set) var isLoadingPreferences = false
    var errorMessage: String?
    var successMessage: String?

    private let session: AuthSession
    /// `/notifications/preferences` is self-scoped server-side (no `settings.manage` needed) —
    /// it's a per-user Profile setting in the frontend too, just implemented via the same
    /// service struct the admin Settings feature uses for its own, differently-scoped calls.
    private let settingsService: SettingsServicing

    init(session: AuthSession = .shared, settingsService: SettingsServicing = SettingsService()) {
        self.session = session
        self.settingsService = settingsService
        theme = session.profile?.themePreference ?? "system"
    }

    var profile: MeResponse? { session.profile }
    var passkeyAvailable: Bool { session.publicConfig.passkeyAvailable }
    var hasPasskeyRegistered: Bool { profile?.authMethods.contains("passkey") ?? false }

    func authMethodLabels() -> [String] {
        (profile?.authMethods ?? []).map { method in
            switch method {
            case "local": return "Lokal (Passwort)"
            case "churchtools": return "ChurchTools"
            case "passkey": return "Passkey"
            default: return method
            }
        }
    }

    func setTheme(_ newTheme: String) async {
        theme = newTheme
        isSavingTheme = true
        defer { isSavingTheme = false }
        do {
            try await LoginService.setTheme(newTheme)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Design konnte nicht gespeichert werden."
        }
    }

    func changePassword(current: String, new: String, confirmation: String) async -> Bool {
        do {
            try await LoginService.changePassword(current: current, new: new, confirmation: confirmation)
            successMessage = "Passwort wurde geändert."
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Passwort konnte nicht geändert werden."
            return false
        }
    }

    /// Registers a new platform passkey for this account. The backend exposes no endpoint to
    /// list or remove individual passkeys by device — see the iOS README's recommendations —
    /// so this can only add one, not manage existing ones.
    func registerPasskey(deviceLabel: String) async {
        isRegisteringPasskey = true
        defer { isRegisteringPasskey = false }
        do {
            try await PasskeyAuthCoordinator().registerPasskey(deviceLabel: deviceLabel.isEmpty ? nil : deviceLabel)
            successMessage = "Passkey wurde hinzugefügt."
            await session.refreshProfile()
        } catch PasskeyAuthCoordinator.CoordinatorError.userCancelled {
            // No error banner for a deliberate cancel.
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Passkey konnte nicht hinzugefügt werden."
        }
    }

    func logout() async {
        await session.logout()
    }

    func loadNotificationPreferences() async {
        isLoadingPreferences = true
        defer { isLoadingPreferences = false }
        do {
            notificationPreferences = try await settingsService.fetchNotificationPreferences()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Benachrichtigungseinstellungen konnten nicht geladen werden."
        }
    }

    func togglePreference(_ preference: NotificationPreference, enabled: Bool) async {
        guard let index = notificationPreferences.firstIndex(where: { $0.key == preference.key }) else { return }
        let previous = notificationPreferences[index].enabled
        notificationPreferences[index] = NotificationPreference(key: preference.key, label: preference.label, enabled: enabled)
        do {
            try await settingsService.updateNotificationPreference(eventKey: preference.key, enabled: enabled)
        } catch {
            notificationPreferences[index] = NotificationPreference(key: preference.key, label: preference.label, enabled: previous)
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Einstellung konnte nicht gespeichert werden."
        }
    }
}
