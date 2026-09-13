import Foundation
import Observation

@MainActor
@Observable
final class LoanTemplatesViewModel {
    private(set) var templates: [LoanTemplate] = []
    private(set) var isLoading = false
    var errorMessage: String?

    private let service: LoanServicing

    init(service: LoanServicing = LoanService()) {
        self.service = service
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            templates = try await service.fetchTemplates()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Vorlagen konnten nicht geladen werden."
        }
    }

    func create(name: String, notes: String, items: [LoanTemplateItemInput]) async {
        do {
            _ = try await service.createTemplate(name: name, notes: notes.isEmpty ? nil : notes, items: items)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Vorlage konnte nicht angelegt werden."
        }
    }

    func delete(_ template: LoanTemplate) async {
        do {
            try await service.deleteTemplate(id: template.id)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Vorlage konnte nicht gelöscht werden."
        }
    }
}
