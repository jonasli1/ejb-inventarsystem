import Foundation
import Observation

@MainActor
@Observable
final class OnboardingViewModel {
    var rawInput: String = ""
    private(set) var isValidating = false
    var errorMessage: String?

    /// When reused from Settings to point the app at a different backend, a successful
    /// validation must also discard the (now-invalid, other-server) stored tokens — first-run
    /// onboarding has no tokens yet, so this only changes behavior for that reuse case.
    private let isChangingExistingServer: Bool

    init(isChangingExistingServer: Bool = false) {
        self.isChangingExistingServer = isChangingExistingServer
    }

    func submit() async {
        errorMessage = nil
        guard let candidate = APIConfiguration.validateFormat(rawInput) else {
            errorMessage = "Das ist keine gültige Adresse. Bitte z. B. „https://ejb.lindner.app“ eingeben."
            return
        }

        isValidating = true
        defer { isValidating = false }

        let previousBaseURL = APIConfiguration.baseURL
        APIConfiguration.baseURL = candidate
        do {
            try await APIClient.shared.ping()
            if isChangingExistingServer {
                await AuthSession.shared.changeBaseURL(to: candidate)
            } else {
                await AuthSession.shared.finishOnboarding(baseURL: candidate)
            }
        } catch {
            APIConfiguration.baseURL = previousBaseURL
            errorMessage = friendlyMessage(for: error)
        }
    }

    private func friendlyMessage(for error: Error) -> String {
        if let apiError = error as? APIError {
            switch apiError {
            case .server(let statusCode, _, _) where statusCode == 404:
                return "Unter dieser Adresse wurde keine Inventarsystem-API gefunden (404). Bitte die Adresse prüfen."
            default:
                return apiError.errorDescription ?? "Die Verbindung zur Server-Adresse ist fehlgeschlagen."
            }
        }
        return "Die Verbindung zur Server-Adresse ist fehlgeschlagen."
    }
}
