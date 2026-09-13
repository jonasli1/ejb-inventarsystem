import Foundation

nonisolated protocol LoanServicing: Sendable {
    func fetchAll(status: LoanStatus?, page: Int, pageSize: Int) async throws -> (items: [Loan], meta: PageMeta)
    func fetchDetail(id: String) async throws -> Loan
    func fetchCalendar(from: Date, to: Date) async throws -> [CalendarLoanEntry]
    func create(_ input: CreateLoanInput) async throws -> Loan
    func update(id: String, input: CreateLoanInput) async throws -> Loan
    func approve(id: String, itemIds: [String]?) async throws -> Loan
    func issue(id: String) async throws -> Loan
    func returnItems(id: String, items: [ReturnLoanItemInput], notes: String?) async throws -> Loan
    func resetStatus(id: String) async throws -> Loan
    func delete(id: String) async throws

    func fetchTemplates() async throws -> [LoanTemplate]
    func fetchTemplate(id: String) async throws -> LoanTemplate
    func createTemplate(name: String, notes: String?, items: [LoanTemplateItemInput]) async throws -> LoanTemplate
    func deleteTemplate(id: String) async throws

    func fetchBlackoutPeriods() async throws -> [BlackoutPeriod]
    func createBlackoutPeriod(startDate: Date, endDate: Date, reason: String?) async throws -> BlackoutPeriod
    func deleteBlackoutPeriod(id: String) async throws
}

/// One line item on a create/edit form — exactly one of `inventoryItemId` (a specific unit,
/// picked via the shared `AsyncSearchPicker`) or `articleId`+`quantity` (an Artikel, "n
/// available units auto-assigned" — the backend picks which physical units) must be set.
nonisolated struct CreateLoanItemInput: Encodable, Sendable {
    var inventoryItemId: String?
    var articleId: String?
    var quantity: Int?
}

nonisolated struct LoanTemplateItemInput: Encodable, Sendable {
    var articleId: String
    var quantity: Int
}

nonisolated struct ReturnLoanItemInput: Encodable, Sendable {
    var loanItemId: String
    var newStatus: InventoryStatus?
}

/// Shared by both create and update — the backend's `UpdateLoanDto` mirrors `CreateLoanDto`
/// (editing resets status to `requested` if the loan hasn't been issued yet, per the backend).
nonisolated struct CreateLoanInput: Encodable, Sendable {
    var borrowerPersonId: String?
    var borrowerName: String?
    var borrowerStreet: String
    var borrowerCity: String
    var borrowerEmail: String
    var borrowerPhone: String
    var checkoutDate: Date?
    var dueDate: Date
    var notes: String = ""
    /// Lets a `loans.manage`/`administer` holder opt OUT of auto-approval, keeping the loan at
    /// `requested` — omit (not `false`) when not applicable, matching the reference frontend's
    /// checkbox which only appears for those roles.
    var forceRequested: Bool?
    var items: [CreateLoanItemInput]
    /// `administer`-only: also save this item set as a reusable template under this name.
    var saveAsTemplateName: String?

    private enum CodingKeys: String, CodingKey {
        case borrowerPersonId, borrowerName, borrowerStreet, borrowerCity, borrowerEmail,
             borrowerPhone, checkoutDate, dueDate, notes, forceRequested, items, saveAsTemplate
    }
    private struct SaveAsTemplate: Encodable { let name: String }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(borrowerPersonId, forKey: .borrowerPersonId)
        try container.encodeIfPresent(borrowerName, forKey: .borrowerName)
        try container.encode(borrowerStreet, forKey: .borrowerStreet)
        try container.encode(borrowerCity, forKey: .borrowerCity)
        try container.encode(borrowerEmail, forKey: .borrowerEmail)
        try container.encode(borrowerPhone, forKey: .borrowerPhone)
        try container.encodeIfPresent(checkoutDate, forKey: .checkoutDate)
        try container.encode(dueDate, forKey: .dueDate)
        try container.encode(notes, forKey: .notes)
        try container.encodeIfPresent(forceRequested, forKey: .forceRequested)
        try container.encode(items, forKey: .items)
        if let saveAsTemplateName, !saveAsTemplateName.isEmpty {
            try container.encode(SaveAsTemplate(name: saveAsTemplateName), forKey: .saveAsTemplate)
        }
    }
}

nonisolated struct LoanService: LoanServicing {
    private struct ApproveBody: Encodable { let itemIds: [String]? }
    private struct ReturnBody: Encodable { let items: [ReturnLoanItemInput]; let notes: String? }
    private struct TemplateBody: Encodable { let name: String; let notes: String?; let items: [LoanTemplateItemInput] }
    private struct BlackoutBody: Encodable { let startDate: Date; let endDate: Date; let reason: String? }

    func fetchAll(status: LoanStatus?, page: Int = 1, pageSize: Int = 25) async throws -> (items: [Loan], meta: PageMeta) {
        var query = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "pageSize", value: String(pageSize))]
        if let status { query.append(URLQueryItem(name: "status", value: status.rawValue)) }
        let result: OffsetPage<Loan> = try await APIClient.shared.request("loans", query: query)
        return (result.data, result.meta)
    }

    func fetchDetail(id: String) async throws -> Loan {
        try await APIClient.shared.request("loans/\(id)")
    }

    func fetchCalendar(from: Date, to: Date) async throws -> [CalendarLoanEntry] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return try await APIClient.shared.request("loans/calendar", query: [
            URLQueryItem(name: "from", value: formatter.string(from: from)),
            URLQueryItem(name: "to", value: formatter.string(from: to))
        ])
    }

    func create(_ input: CreateLoanInput) async throws -> Loan {
        try await APIClient.shared.request("loans", method: "POST", body: input)
    }

    func update(id: String, input: CreateLoanInput) async throws -> Loan {
        try await APIClient.shared.request("loans/\(id)", method: "PUT", body: input)
    }

    func approve(id: String, itemIds: [String]?) async throws -> Loan {
        try await APIClient.shared.request("loans/\(id)/approve", method: "POST", body: ApproveBody(itemIds: itemIds))
    }

    func issue(id: String) async throws -> Loan {
        try await APIClient.shared.request("loans/\(id)/issue", method: "POST")
    }

    func returnItems(id: String, items: [ReturnLoanItemInput], notes: String?) async throws -> Loan {
        try await APIClient.shared.request("loans/\(id)/return", method: "POST", body: ReturnBody(items: items, notes: notes))
    }

    func resetStatus(id: String) async throws -> Loan {
        try await APIClient.shared.request("loans/\(id)/reset-status", method: "POST")
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("loans/\(id)", method: "DELETE")
    }

    func fetchTemplates() async throws -> [LoanTemplate] {
        try await APIClient.shared.request("loans/templates")
    }

    func fetchTemplate(id: String) async throws -> LoanTemplate {
        try await APIClient.shared.request("loans/templates/\(id)")
    }

    func createTemplate(name: String, notes: String?, items: [LoanTemplateItemInput]) async throws -> LoanTemplate {
        try await APIClient.shared.request("loans/templates", method: "POST", body: TemplateBody(name: name, notes: notes, items: items))
    }

    func deleteTemplate(id: String) async throws {
        try await APIClient.shared.requestVoid("loans/templates/\(id)", method: "DELETE")
    }

    func fetchBlackoutPeriods() async throws -> [BlackoutPeriod] {
        try await APIClient.shared.request("loans/blackout-periods")
    }

    func createBlackoutPeriod(startDate: Date, endDate: Date, reason: String?) async throws -> BlackoutPeriod {
        try await APIClient.shared.request(
            "loans/blackout-periods", method: "POST", body: BlackoutBody(startDate: startDate, endDate: endDate, reason: reason)
        )
    }

    func deleteBlackoutPeriod(id: String) async throws {
        try await APIClient.shared.requestVoid("loans/blackout-periods/\(id)", method: "DELETE")
    }
}
