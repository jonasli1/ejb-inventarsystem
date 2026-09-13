import Foundation

nonisolated struct UpdateGeneralSettingsInput: Encodable, Sendable {
    var displayName: String?
    var churchToolsEnabled: Bool?
    var passkeyEnabled: Bool?
}

nonisolated struct UpdateEmailConfigInput: Encodable, Sendable {
    var enabled: Bool?
    var host: String?
    var port: Int?
    var secure: Bool?
    var username: String?
    var password: String?
    var fromAddress: String?
    var fromName: String?
    var footerHtml: String?
}

nonisolated struct UpdateBackupConfigInput: Encodable, Sendable {
    var enabled: Bool?
    var frequency: BackupFrequency?
    var destinationType: BackupDestinationType?
    var sftpHost: String?
    var sftpPort: Int?
    var sftpUsername: String?
    var sftpPassword: String?
    var sftpRemotePath: String?
    var onedriveFolderPath: String?
}

nonisolated protocol SettingsServicing: Sendable {
    func fetchGeneral() async throws -> AppPublicConfig
    func updateGeneral(_ input: UpdateGeneralSettingsInput) async throws -> AppPublicConfig
    func uploadLogo(data: Data, mimeType: String) async throws -> AppPublicConfig
    func removeLogo() async throws

    func fetchEmailConfig() async throws -> EmailConfig
    func updateEmailConfig(_ input: UpdateEmailConfigInput) async throws -> EmailConfig
    /// Success is 200-with-no-meaningful-body; failure (misconfigured server, bad recipient)
    /// surfaces as a thrown `APIError`, per the backend's `EmailConfigController.sendTest`.
    func testEmailConfig(toAddress: String) async throws

    func fetchNotificationTemplates() async throws -> [NotificationTemplate]
    func updateNotificationTemplate(eventKey: String, subject: String, bodyHtml: String) async throws -> NotificationTemplate
    func resetNotificationTemplate(eventKey: String) async throws -> NotificationTemplate
    func fetchNotificationPreferences() async throws -> [NotificationPreference]
    func updateNotificationPreference(eventKey: String, enabled: Bool) async throws

    func fetchBackupConfig() async throws -> BackupConfig
    func updateBackupConfig(_ input: UpdateBackupConfigInput) async throws -> BackupConfig
    /// Unlike the email test, a failed CONNECTION still responds 200 with `ok: false` — only a
    /// missing destination config throws — per `BackupService.testConnection`.
    func testBackupConfig() async throws -> (ok: Bool, message: String)
    func fetchOneDriveAuthorizeURL() async throws -> URL
    /// The backend's `OneDriveCallbackDto` takes only `{code}` — confirmed by reading the
    /// controller/DTO directly; no `state` field (unlike the ChurchTools flow).
    func submitOneDriveCallback(code: String) async throws

    /// Downloads the full backup archive (`.tar.gz`, raw bytes) for manual save/share.
    func exportBackup() async throws -> Data
    /// Restores from a previously exported archive — overwrites all current data server-side.
    func importBackup(data: Data) async throws
}

nonisolated struct SettingsService: SettingsServicing {
    private struct TemplateBody: Encodable { let subject: String; let bodyHtml: String }
    private struct PreferenceBody: Encodable { let enabled: Bool }
    private struct AuthorizeURLResponse: Decodable { let url: String }
    private struct OneDriveCallbackBody: Encodable { let code: String }
    private struct SendTestEmailBody: Encodable { let toAddress: String }
    private struct TestConnectionResponse: Decodable { let ok: Bool; let message: String }

    func fetchGeneral() async throws -> AppPublicConfig {
        try await APIClient.shared.request("settings/general", requiresAuth: false)
    }

    func updateGeneral(_ input: UpdateGeneralSettingsInput) async throws -> AppPublicConfig {
        try await APIClient.shared.request("settings/general", method: "PUT", body: input)
    }

    func uploadLogo(data: Data, mimeType: String) async throws -> AppPublicConfig {
        try await APIClient.shared.uploadMultipart(
            "settings/general/logo", fileFieldName: "file", fileName: "logo", mimeType: mimeType, fileData: data
        )
    }

    func removeLogo() async throws {
        try await APIClient.shared.requestVoid("settings/general/logo", method: "DELETE")
    }

    func fetchEmailConfig() async throws -> EmailConfig {
        try await APIClient.shared.request("notifications/email-config")
    }

    func updateEmailConfig(_ input: UpdateEmailConfigInput) async throws -> EmailConfig {
        try await APIClient.shared.request("notifications/email-config", method: "PUT", body: input)
    }

    func testEmailConfig(toAddress: String) async throws {
        try await APIClient.shared.requestVoid(
            "notifications/email-config/test", method: "POST", body: SendTestEmailBody(toAddress: toAddress)
        )
    }

    func fetchNotificationTemplates() async throws -> [NotificationTemplate] {
        try await APIClient.shared.request("notifications/templates")
    }

    func updateNotificationTemplate(eventKey: String, subject: String, bodyHtml: String) async throws -> NotificationTemplate {
        try await APIClient.shared.request(
            "notifications/templates/\(eventKey)", method: "PUT", body: TemplateBody(subject: subject, bodyHtml: bodyHtml)
        )
    }

    func resetNotificationTemplate(eventKey: String) async throws -> NotificationTemplate {
        try await APIClient.shared.request("notifications/templates/\(eventKey)/reset", method: "PUT")
    }

    func fetchNotificationPreferences() async throws -> [NotificationPreference] {
        try await APIClient.shared.request("notifications/preferences")
    }

    func updateNotificationPreference(eventKey: String, enabled: Bool) async throws {
        try await APIClient.shared.requestVoid(
            "notifications/preferences/\(eventKey)", method: "PUT", body: PreferenceBody(enabled: enabled)
        )
    }

    func fetchBackupConfig() async throws -> BackupConfig {
        try await APIClient.shared.request("backup/config")
    }

    func updateBackupConfig(_ input: UpdateBackupConfigInput) async throws -> BackupConfig {
        try await APIClient.shared.request("backup/config", method: "PUT", body: input)
    }

    func testBackupConfig() async throws -> (ok: Bool, message: String) {
        let response: TestConnectionResponse = try await APIClient.shared.request("backup/config/test", method: "POST")
        return (response.ok, response.message)
    }

    func fetchOneDriveAuthorizeURL() async throws -> URL {
        let response: AuthorizeURLResponse = try await APIClient.shared.request("backup/onedrive/authorize-url")
        guard let url = URL(string: response.url) else { throw APIError.decoding(underlying: URLError(.badURL)) }
        return url
    }

    func submitOneDriveCallback(code: String) async throws {
        try await APIClient.shared.requestVoid("backup/onedrive/callback", method: "POST", body: OneDriveCallbackBody(code: code))
    }

    func exportBackup() async throws -> Data {
        try await APIClient.shared.requestData("backup/export")
    }

    func importBackup(data: Data) async throws {
        let _: ImportResult = try await APIClient.shared.uploadMultipart(
            "backup/import", fileFieldName: "file", fileName: "backup.tar.gz", mimeType: "application/gzip", fileData: data
        )
    }

    private struct ImportResult: Decodable { let restored: Bool }
}
