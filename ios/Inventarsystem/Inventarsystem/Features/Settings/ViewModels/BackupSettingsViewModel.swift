import Foundation
import Observation

@MainActor
@Observable
final class BackupSettingsViewModel {
    var enabled = false
    var frequency: BackupFrequency = .weekly
    var destinationType: BackupDestinationType?
    var sftpHost = ""
    var sftpPort = "22"
    var sftpUsername = ""
    var sftpPassword = ""
    var sftpRemotePath = ""
    var onedriveFolderPath = ""
    private(set) var sftpPasswordSet = false
    private(set) var onedriveConnected = false
    private(set) var onedriveConfigured = false
    private(set) var lastRunAt: Date?
    private(set) var lastRunStatus: String?
    private(set) var lastRunMessage: String?

    private(set) var isLoading = true
    private(set) var isSaving = false
    private(set) var isTesting = false
    private(set) var isExporting = false
    private(set) var isImporting = false
    private(set) var isConnectingOneDrive = false
    private(set) var testResultMessage: String?
    private(set) var testResultIsSuccess = false
    var errorMessage: String?
    var successMessage: String?
    var exportedData: Data?

    private let service: SettingsServicing

    init(service: SettingsServicing = SettingsService()) {
        self.service = service
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            apply(try await service.fetchBackupConfig())
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Backup-Konfiguration konnte nicht geladen werden."
        }
    }

    func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            let config = try await service.updateBackupConfig(UpdateBackupConfigInput(
                enabled: enabled,
                frequency: frequency,
                destinationType: destinationType,
                sftpHost: sftpHost.isEmpty ? nil : sftpHost,
                sftpPort: Int(sftpPort),
                sftpUsername: sftpUsername.isEmpty ? nil : sftpUsername,
                sftpPassword: sftpPassword.isEmpty ? nil : sftpPassword,
                sftpRemotePath: sftpRemotePath.isEmpty ? nil : sftpRemotePath,
                onedriveFolderPath: onedriveFolderPath.isEmpty ? nil : onedriveFolderPath
            ))
            apply(config)
            sftpPassword = ""
            successMessage = "Backup-Konfiguration gespeichert."
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Backup-Konfiguration konnte nicht gespeichert werden."
        }
    }

    func test() async {
        isTesting = true
        defer { isTesting = false }
        do {
            let result = try await service.testBackupConfig()
            testResultIsSuccess = result.ok
            testResultMessage = result.message
        } catch {
            testResultIsSuccess = false
            testResultMessage = (error as? LocalizedError)?.errorDescription ?? "Verbindungstest fehlgeschlagen."
        }
    }

    func exportBackup() async {
        isExporting = true
        defer { isExporting = false }
        do {
            exportedData = try await service.exportBackup()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Backup konnte nicht heruntergeladen werden."
        }
    }

    func importBackup(data: Data) async {
        isImporting = true
        defer { isImporting = false }
        do {
            try await service.importBackup(data: data)
            successMessage = "Backup wurde eingespielt."
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Backup konnte nicht eingespielt werden."
        }
    }

    /// Structurally identical to the ChurchTools login flow — see `OAuthRedirectCoordinator`.
    func connectOneDrive() async {
        isConnectingOneDrive = true
        defer { isConnectingOneDrive = false }
        do {
            let authURL = try await service.fetchOneDriveAuthorizeURL()
            let result = try await OAuthRedirectCoordinator().start(authorizationURL: authURL)
            try await service.submitOneDriveCallback(code: result.code)
            apply(try await service.fetchBackupConfig())
            successMessage = "OneDrive wurde verbunden."
        } catch OAuthRedirectCoordinator.CoordinatorError.userCancelled {
            // No error banner for a deliberate cancel.
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "OneDrive konnte nicht verbunden werden."
        }
    }

    private func apply(_ config: BackupConfig) {
        enabled = config.enabled
        frequency = config.frequency
        destinationType = config.destinationType
        sftpHost = config.sftpHost ?? ""
        sftpPort = config.sftpPort.map(String.init) ?? "22"
        sftpUsername = config.sftpUsername ?? ""
        sftpPasswordSet = config.sftpPasswordSet
        sftpRemotePath = config.sftpRemotePath ?? ""
        onedriveConnected = config.onedriveConnected
        onedriveFolderPath = config.onedriveFolderPath ?? ""
        onedriveConfigured = config.onedriveConfigured
        lastRunAt = config.lastRunAt
        lastRunStatus = config.lastRunStatus
        lastRunMessage = config.lastRunMessage
    }
}
