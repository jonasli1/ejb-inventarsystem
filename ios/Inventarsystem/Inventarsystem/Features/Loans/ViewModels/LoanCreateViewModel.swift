import Foundation
import Observation

/// One line on the create/edit form — either a specific Inventarobjekt, or an Artikel picked
/// "nach Menge" (by quantity, letting the backend auto-assign available units). `isAccessory`
/// marks a row that was auto-added because its parent item has accessories, matching the
/// reference frontend's auto-add-to-loan behavior — removed as a unit if the parent is removed.
nonisolated struct LoanDraftLine: Identifiable, Sendable {
    enum Kind: Sendable {
        case specificItem(InventoryItem)
        case articleQuantity(Article, quantity: Int)
    }
    let id: String
    var kind: Kind
    var isAccessory: Bool = false
    var parentLineId: String?

    var displayTitle: String {
        switch kind {
        case .specificItem(let item): return item.displayNumber
        case .articleQuantity(let article, let quantity): return "\(article.name) × \(quantity)"
        }
    }
    var displaySubtitle: String {
        switch kind {
        case .specificItem(let item): return item.article.name
        case .articleQuantity(let article, _): return article.unitOfMeasure ?? ""
        }
    }
}

@MainActor
@Observable
final class LoanCreateViewModel {
    /// Non-nil when this view model is editing an existing loan rather than creating a new
    /// one — `save()` then calls `update` instead of `create`.
    private(set) var editingLoanId: String?
    var borrowerName = ""
    var borrowerStreet = ""
    var borrowerCity = ""
    var borrowerEmail = ""
    var borrowerPhone = ""
    var checkoutDate = Date()
    var dueDate = Date().addingTimeInterval(7 * 24 * 3600)
    var notes = ""
    var forceRequested = false
    var saveAsTemplateName = ""
    private(set) var lines: [LoanDraftLine] = []
    private(set) var isSaving = false
    var errorMessage: String?

    private let loanService: LoanServicing
    private let inventoryService: InventoryServicing

    init(loanService: LoanServicing = LoanService(), inventoryService: InventoryServicing = InventoryService()) {
        self.loanService = loanService
        self.inventoryService = inventoryService
    }

    var canSave: Bool {
        !borrowerStreet.isEmpty && !borrowerCity.isEmpty && !borrowerEmail.isEmpty
            && !borrowerPhone.isEmpty && !lines.isEmpty && !isSaving
    }

    func itemSearch(_ query: String) async -> [InventoryItem] {
        (try? await inventoryService.fetchFlat(cursor: nil, limit: 8, filters: InventoryFilters(search: query)).items) ?? []
    }

    /// Adds a specific Inventarobjekt line and, matching the reference frontend, auto-adds any
    /// of its accessories as follow-on lines tagged `isAccessory`.
    func addSpecificItem(_ item: InventoryItem) async {
        let lineId = "item-\(item.id)"
        guard !lines.contains(where: { $0.id == lineId }) else { return }
        lines.append(LoanDraftLine(id: lineId, kind: .specificItem(item)))

        if let detail = try? await inventoryService.fetchDetail(id: item.id) {
            for accessory in detail.accessories {
                let accessoryLineId = "item-\(accessory.id)"
                guard !lines.contains(where: { $0.id == accessoryLineId }) else { continue }
                lines.append(LoanDraftLine(id: accessoryLineId, kind: .specificItem(accessory), isAccessory: true, parentLineId: lineId))
            }
        }
    }

    func addArticleQuantity(_ article: Article, quantity: Int) {
        let lineId = "article-\(article.id)"
        if let index = lines.firstIndex(where: { $0.id == lineId }) {
            lines[index].kind = .articleQuantity(article, quantity: quantity)
        } else {
            lines.append(LoanDraftLine(id: lineId, kind: .articleQuantity(article, quantity: quantity)))
        }
    }

    /// Removing a line also removes any accessory lines it pulled in, matching the reference
    /// frontend ("removed as a unit if the parent row is removed").
    func removeLine(_ line: LoanDraftLine) {
        lines.removeAll { $0.id == line.id || $0.parentLineId == line.id }
    }

    /// Pre-fills the form from an existing loan and switches `save()` into edit mode.
    func seed(from loan: Loan) {
        editingLoanId = loan.id
        borrowerName = loan.borrowerName ?? ""
        borrowerStreet = loan.borrowerStreet ?? ""
        borrowerCity = loan.borrowerCity ?? ""
        borrowerEmail = loan.borrowerEmail ?? ""
        borrowerPhone = loan.borrowerPhone ?? ""
        checkoutDate = loan.checkoutDate
        dueDate = loan.dueDate ?? loan.checkoutDate
        notes = loan.notes ?? ""
        lines = loan.items.map { loanItem in
            LoanDraftLine(id: "item-\(loanItem.inventoryItem.id)", kind: .specificItem(loanItem.inventoryItem))
        }
    }

    func save() async -> Loan? {
        isSaving = true
        defer { isSaving = false }

        let items: [CreateLoanItemInput] = lines.map { line in
            switch line.kind {
            case .specificItem(let item):
                return CreateLoanItemInput(inventoryItemId: item.id, articleId: nil, quantity: nil)
            case .articleQuantity(let article, let quantity):
                return CreateLoanItemInput(inventoryItemId: nil, articleId: article.id, quantity: quantity)
            }
        }

        let input = CreateLoanInput(
            borrowerPersonId: nil,
            borrowerName: borrowerName.isEmpty ? nil : borrowerName,
            borrowerStreet: borrowerStreet,
            borrowerCity: borrowerCity,
            borrowerEmail: borrowerEmail,
            borrowerPhone: borrowerPhone,
            checkoutDate: checkoutDate,
            dueDate: dueDate,
            notes: notes,
            forceRequested: forceRequested ? true : nil,
            items: items,
            saveAsTemplateName: saveAsTemplateName.isEmpty ? nil : saveAsTemplateName
        )

        do {
            if let editingLoanId {
                return try await loanService.update(id: editingLoanId, input: input)
            }
            return try await loanService.create(input)
        } catch {
            let verb = editingLoanId == nil ? "angelegt" : "gespeichert"
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Ausleihe konnte nicht \(verb) werden."
            return nil
        }
    }

    /// Prefills item lines (as Artikel/Menge rows) from a saved template.
    func applyTemplate(_ template: LoanTemplate) {
        for templateItem in template.items {
            addArticleQuantity(templateItem.article, quantity: templateItem.quantity)
        }
        if notes.isEmpty, let templateNotes = template.notes {
            notes = templateNotes
        }
    }
}
