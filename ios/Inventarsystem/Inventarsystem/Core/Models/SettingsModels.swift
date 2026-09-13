import Foundation

nonisolated struct EmailConfig: Codable, Sendable {
    let enabled: Bool
    let host: String?
    let port: Int?
    let secure: Bool
    let username: String?
    let passwordSet: Bool
    let fromAddress: String?
    let fromName: String?
    let footerHtml: String?
}

nonisolated enum BackupFrequency: String, Codable, Sendable, CaseIterable {
    case daily, weekly, monthly

    var label: String {
        switch self {
        case .daily: return "Täglich"
        case .weekly: return "Wöchentlich"
        case .monthly: return "Monatlich"
        }
    }
}

nonisolated enum BackupDestinationType: String, Codable, Sendable, CaseIterable {
    case sftp, onedrive

    var label: String {
        switch self {
        case .sftp: return "SFTP"
        case .onedrive: return "OneDrive"
        }
    }
}

nonisolated struct BackupConfig: Codable, Sendable {
    let enabled: Bool
    let frequency: BackupFrequency
    let destinationType: BackupDestinationType?
    let sftpHost: String?
    let sftpPort: Int?
    let sftpUsername: String?
    let sftpPasswordSet: Bool
    let sftpRemotePath: String?
    let onedriveConnected: Bool
    let onedriveFolderPath: String?
    let onedriveConfigured: Bool
    let lastRunAt: Date?
    let lastRunStatus: String?
    let lastRunMessage: String?
}

nonisolated struct NotificationTemplateVariable: Codable, Sendable, Identifiable {
    let key: String
    let description: String
    var id: String { key }
}

nonisolated struct NotificationTemplate: Codable, Sendable, Identifiable {
    let eventKey: String
    let label: String
    let variables: [NotificationTemplateVariable]
    let subject: String
    let bodyHtml: String
    let isCustomized: Bool
    let updatedAt: Date?
    var id: String { eventKey }
}

nonisolated struct NotificationPreference: Codable, Sendable, Identifiable {
    let key: String
    let label: String
    let enabled: Bool
    var id: String { key }
}
