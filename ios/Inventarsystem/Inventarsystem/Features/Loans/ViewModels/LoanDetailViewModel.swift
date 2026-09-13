import Foundation
import Observation

@MainActor
@Observable
final class LoanDetailViewModel {
    let loanId: String
    private(set) var loan: Loan?
    private(set) var isLoading = false
    private(set) var isDeleted = false
    var errorMessage: String?

    private let service: LoanServicing
    private let attachmentService: AttachmentServicing

    init(loanId: String, service: LoanServicing = LoanService(), attachmentService: AttachmentServicing = AttachmentService()) {
        self.loanId = loanId
        self.service = service
        self.attachmentService = attachmentService
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            loan = try await service.fetchDetail(id: loanId)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Ausleihe konnte nicht geladen werden."
        }
    }

    func approve(itemIds: [String]? = nil) async {
        do {
            loan = try await service.approve(id: loanId, itemIds: itemIds)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Ausleihe konnte nicht genehmigt werden."
        }
    }

    func issue() async {
        do {
            loan = try await service.issue(id: loanId)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Ausleihe konnte nicht ausgegeben werden."
        }
    }

    func returnItems(_ items: [ReturnLoanItemInput], notes: String?) async {
        do {
            loan = try await service.returnItems(id: loanId, items: items, notes: notes)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rückgabe konnte nicht erfasst werden."
        }
    }

    func resetStatus() async {
        do {
            loan = try await service.resetStatus(id: loanId)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Status konnte nicht zurückgesetzt werden."
        }
    }

    func delete() async {
        do {
            try await service.delete(id: loanId)
            isDeleted = true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Ausleihe konnte nicht gelöscht werden."
        }
    }

    func uploadConditionPhoto(loanItemId: String, category: AttachmentCategory, fileName: String, mimeType: String, data: Data) async {
        do {
            _ = try await attachmentService.upload(entityType: .loanItem, entityId: loanItemId, category: category, fileName: fileName, mimeType: mimeType, data: data)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Foto konnte nicht hochgeladen werden."
        }
    }
}
