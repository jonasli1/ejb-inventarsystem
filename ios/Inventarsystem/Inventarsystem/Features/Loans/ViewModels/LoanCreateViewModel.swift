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
    var subject = ""
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
        !subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !borrowerStreet.isEmpty && !borrowerCity.isEmpty && !borrowerEmail.isEmpty
            && !borrowerPhone.isEmpty && !lines.isEmpty && !isSaving
    }

    /// Items that are themselves accessory of another object can't be loaned individually -
    /// they're only ever added automatically alongside their main object - unless explicitly
    /// flagged as separately loanable, matching the reference frontend's `ItemSearchSelect`.
    func itemSearch(_ query: String) async -> [InventoryItem] {
        let items = (try? await inventoryService.fetchFlat(cursor: nil, limit: 8, filters: InventoryFilters(search: query)).items) ?? []
        return items.filter { $0.parentItemId == nil || $0.separatelyLoanable }
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

    /// A "group" is a main line plus its trailing accessory lines (always kept adjacent) -
    /// reordering moves a whole group at once, so an accessory can never end up separated from
    /// (or reordered independently of) its main object. Mirrors the reference frontend's
    /// `itemRowGroups.ts`.
    private func groupBounds(at index: Int) -> (start: Int, end: Int) {
        var start = index
        while start > 0 && lines[start].isAccessory { start -= 1 }
        var end = start
        while end + 1 < lines.count && lines[end + 1].parentLineId == lines[start].id { end += 1 }
        return (start, end)
    }

    func canMoveLine(at index: Int, direction: Int) -> Bool {
        let (start, end) = groupBounds(at: index)
        return direction < 0 ? start > 0 : end + 1 < lines.count
    }

    /// Moves the whole group containing `index` up (direction < 0) or down (direction > 0),
    /// swapping it with the adjacent group.
    func moveLine(at index: Int, direction: Int) {
        let (start, end) = groupBounds(at: index)
        if direction < 0 {
            guard start > 0 else { return }
            let (prevStart, _) = groupBounds(at: start - 1)
            let group = Array(lines[start...end])
            let prevGroup = Array(lines[prevStart..<start])
            lines.replaceSubrange(prevStart...end, with: group + prevGroup)
        } else {
            guard end + 1 < lines.count else { return }
            let (_, nextEnd) = groupBounds(at: end + 1)
            let group = Array(lines[start...end])
            let nextGroup = Array(lines[(end + 1)...nextEnd])
            lines.replaceSubrange(start...nextEnd, with: nextGroup + group)
        }
    }

    /// Pre-fills the form from an existing loan and switches `save()` into edit mode.
    /// Consecutive non-accessory items sharing the same article are grouped back into a single
    /// "by quantity" line (so a quantity originally requested via articleId+quantity can simply
    /// be edited as a number), matching the reference frontend's `initialItems`.
    func seed(from loan: Loan) {
        editingLoanId = loan.id
        subject = loan.subject
        borrowerName = loan.borrowerName ?? ""
        borrowerStreet = loan.borrowerStreet ?? ""
        borrowerCity = loan.borrowerCity ?? ""
        borrowerEmail = loan.borrowerEmail ?? ""
        borrowerPhone = loan.borrowerPhone ?? ""
        checkoutDate = loan.checkoutDate
        dueDate = loan.dueDate ?? loan.checkoutDate
        notes = loan.notes ?? ""

        let idsInLoan = Set(loan.items.map(\.inventoryItemId))
        func isAccessory(_ loanItem: LoanItem) -> Bool {
            guard let parentId = loanItem.inventoryItem.parentItemId else { return false }
            return idsInLoan.contains(parentId)
        }

        var newLines: [LoanDraftLine] = []
        var i = 0
        let items = loan.items
        while i < items.count {
            let current = items[i]
            if isAccessory(current) {
                newLines.append(LoanDraftLine(
                    id: "item-\(current.inventoryItem.id)",
                    kind: .specificItem(current.inventoryItem),
                    isAccessory: true,
                    parentLineId: current.inventoryItem.parentItemId.map { "item-\($0)" }
                ))
                i += 1
                continue
            }
            var j = i
            while j < items.count, items[j].inventoryItem.articleId == current.inventoryItem.articleId, !isAccessory(items[j]) {
                j += 1
            }
            let groupSize = j - i
            if groupSize > 1 {
                newLines.append(LoanDraftLine(
                    id: "article-\(current.inventoryItem.articleId)",
                    kind: .articleQuantity(current.inventoryItem.article, quantity: groupSize)
                ))
            } else {
                newLines.append(LoanDraftLine(id: "item-\(current.inventoryItem.id)", kind: .specificItem(current.inventoryItem)))
            }
            i = j
        }
        lines = newLines
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
            subject: subject,
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
