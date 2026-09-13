import Foundation
import Observation
import SwiftUI
import UIKit

@MainActor
@Observable
final class GeneralSettingsViewModel {
    var displayName = ""
    var churchToolsEnabled = true
    var passkeyEnabled = true
    private(set) var logoDataUrl: String?

    private(set) var isLoading = true
    private(set) var isSaving = false
    private(set) var isUploadingLogo = false
    var errorMessage: String?
    var successMessage: String?

    private let service: SettingsServicing
    private let session: AuthSession

    init(service: SettingsServicing = SettingsService(), session: AuthSession = .shared) {
        self.service = service
        self.session = session
    }

    var logoImage: Image? {
        guard let logoDataUrl,
              let commaIndex = logoDataUrl.firstIndex(of: ","),
              let data = Data(base64Encoded: String(logoDataUrl[logoDataUrl.index(after: commaIndex)...])),
              let uiImage = UIImage(data: data)
        else { return nil }
        return Image(uiImage: uiImage)
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let config = try await service.fetchGeneral()
            apply(config)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Einstellungen konnten nicht geladen werden."
        }
    }

    func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            let config = try await service.updateGeneral(
                UpdateGeneralSettingsInput(displayName: displayName, churchToolsEnabled: churchToolsEnabled, passkeyEnabled: passkeyEnabled)
            )
            apply(config)
            await session.refreshPublicConfig()
            successMessage = "Einstellungen gespeichert."
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Einstellungen konnten nicht gespeichert werden."
        }
    }

    func uploadLogo(data: Data, mimeType: String) async {
        isUploadingLogo = true
        defer { isUploadingLogo = false }
        do {
            let config = try await service.uploadLogo(data: data, mimeType: mimeType)
            apply(config)
            await session.refreshPublicConfig()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Logo konnte nicht hochgeladen werden."
        }
    }

    func removeLogo() async {
        isUploadingLogo = true
        defer { isUploadingLogo = false }
        do {
            try await service.removeLogo()
            logoDataUrl = nil
            await session.refreshPublicConfig()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Logo konnte nicht entfernt werden."
        }
    }

    private func apply(_ config: AppPublicConfig) {
        displayName = config.displayName
        churchToolsEnabled = config.churchToolsEnabled
        passkeyEnabled = config.passkeyEnabled
        logoDataUrl = config.logoDataUrl
    }
}
