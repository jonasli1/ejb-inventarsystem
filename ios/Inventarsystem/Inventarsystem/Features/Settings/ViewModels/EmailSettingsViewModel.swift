import Foundation
import Observation

@MainActor
@Observable
final class EmailSettingsViewModel {
    // Server tab
    var enabled = false
    var host = ""
    var port = "587"
    var secure = true
    var username = ""
    var password = ""
    var fromAddress = ""
    var fromName = ""
    private(set) var passwordSet = false
    var testAddress = ""
    private(set) var testResultMessage: String?
    private(set) var testResultIsSuccess = false

    // Templates tab
    private(set) var templates: [NotificationTemplate] = []
    var editingTemplate: NotificationTemplate?
    var draftSubject = ""
    var draftBodyHtml = ""

    // Footer tab
    var footerHtml = ""

    private(set) var isLoading = true
    private(set) var isSavingServer = false
    private(set) var isTesting = false
    private(set) var isSavingTemplate = false
    private(set) var isSavingFooter = false
    var errorMessage: String?
    var successMessage: String?

    private let service: SettingsServicing

    init(service: SettingsServicing = SettingsService()) {
        self.service = service
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let configTask = service.fetchEmailConfig()
            async let templatesTask = service.fetchNotificationTemplates()
            let (config, templates) = try await (configTask, templatesTask)
            apply(config)
            self.templates = templates
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "E-Mail-Einstellungen konnten nicht geladen werden."
        }
    }

    func saveServer() async {
        isSavingServer = true
        defer { isSavingServer = false }
        do {
            let config = try await service.updateEmailConfig(UpdateEmailConfigInput(
                enabled: enabled,
                host: host.isEmpty ? nil : host,
                port: Int(port),
                secure: secure,
                username: username.isEmpty ? nil : username,
                password: password.isEmpty ? nil : password,
                fromAddress: fromAddress.isEmpty ? nil : fromAddress,
                fromName: fromName.isEmpty ? nil : fromName
            ))
            apply(config)
            password = ""
            successMessage = "E-Mail-Konfiguration gespeichert."
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "E-Mail-Konfiguration konnte nicht gespeichert werden."
        }
    }

    func sendTestEmail() async {
        guard !testAddress.isEmpty else { return }
        isTesting = true
        defer { isTesting = false }
        do {
            try await service.testEmailConfig(toAddress: testAddress)
            testResultIsSuccess = true
            testResultMessage = "Test-E-Mail an \(testAddress) wurde verschickt."
        } catch {
            testResultIsSuccess = false
            testResultMessage = (error as? LocalizedError)?.errorDescription ?? "Test-E-Mail konnte nicht verschickt werden."
        }
    }

    func beginEditingTemplate(_ template: NotificationTemplate) {
        editingTemplate = template
        draftSubject = template.subject
        draftBodyHtml = template.bodyHtml
    }

    func saveTemplate() async {
        guard let editingTemplate else { return }
        isSavingTemplate = true
        defer { isSavingTemplate = false }
        do {
            let updated = try await service.updateNotificationTemplate(eventKey: editingTemplate.eventKey, subject: draftSubject, bodyHtml: draftBodyHtml)
            replaceTemplate(updated)
            self.editingTemplate = nil
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Vorlage konnte nicht gespeichert werden."
        }
    }

    func resetTemplate() async {
        guard let editingTemplate else { return }
        isSavingTemplate = true
        defer { isSavingTemplate = false }
        do {
            let reset = try await service.resetNotificationTemplate(eventKey: editingTemplate.eventKey)
            replaceTemplate(reset)
            draftSubject = reset.subject
            draftBodyHtml = reset.bodyHtml
            self.editingTemplate = reset
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Vorlage konnte nicht zurückgesetzt werden."
        }
    }

    func saveFooter() async {
        isSavingFooter = true
        defer { isSavingFooter = false }
        do {
            let config = try await service.updateEmailConfig(UpdateEmailConfigInput(footerHtml: footerHtml.isEmpty ? nil : footerHtml))
            apply(config)
            successMessage = "Fußzeile wurde gespeichert."
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Fußzeile konnte nicht gespeichert werden."
        }
    }

    private func replaceTemplate(_ template: NotificationTemplate) {
        if let index = templates.firstIndex(where: { $0.eventKey == template.eventKey }) {
            templates[index] = template
        }
    }

    private func apply(_ config: EmailConfig) {
        enabled = config.enabled
        host = config.host ?? ""
        port = config.port.map(String.init) ?? "587"
        secure = config.secure
        username = config.username ?? ""
        passwordSet = config.passwordSet
        fromAddress = config.fromAddress ?? ""
        fromName = config.fromName ?? ""
        footerHtml = config.footerHtml ?? ""
    }
}
