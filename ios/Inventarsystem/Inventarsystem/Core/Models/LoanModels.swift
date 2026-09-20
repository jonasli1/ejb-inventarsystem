import Foundation

/// `Loan.status` — see `schema.prisma`'s `LoanStatus` enum. Lifecycle:
/// `requested -> approved -> issued -> completed` (a `loans.manage`/`administer` holder's own
/// created loans skip straight to `approved` unless `forceRequested` was set on create).
nonisolated enum LoanStatus: String, Codable, Sendable, CaseIterable, Hashable {
    case requested
    case approved
    case issued
    case completed
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = LoanStatus(rawValue: raw) ?? .unknown
    }

    var label: String {
        switch self {
        case .requested: return "Beantragt"
        case .approved: return "Genehmigt"
        case .issued: return "Herausgegeben"
        case .completed: return "Abgeschlossen"
        case .unknown: return "Unbekannt"
        }
    }
}

extension LoanStatus: BadgeStatus {
    var badgeColorName: BadgeColorName {
        switch self {
        case .requested: return .amber
        case .approved: return .blue
        case .issued: return .purple
        case .completed: return .green
        case .unknown: return .gray
        }
    }
}

nonisolated struct LoanItem: Codable, Identifiable, Sendable {
    let id: String
    let loanId: String
    let inventoryItemId: String
    /// Display/export order within the loan, user-adjustable.
    let sortOrder: Int
    let checkedOutCondition: Int?
    let returnedCondition: Int?
    let returnedAt: Date?
    let approvedAt: Date?
    let approvedByUserId: String?
    let createdAt: Date
    let inventoryItem: InventoryItem
    let approvedBy: UserSummary?

    private enum CodingKeys: String, CodingKey {
        case id, loanId, inventoryItemId, sortOrder, checkedOutCondition, returnedCondition,
             returnedAt, approvedAt, approvedByUserId, createdAt, inventoryItem, approvedBy
    }

    /// Custom decode so `sortOrder` falls back to `0` (its backend default) when absent, instead
    /// of failing the whole decode — keeps the app working against a backend that hasn't rolled
    /// out this field yet.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        loanId = try container.decode(String.self, forKey: .loanId)
        inventoryItemId = try container.decode(String.self, forKey: .inventoryItemId)
        sortOrder = try container.decodeIfPresent(Int.self, forKey: .sortOrder) ?? 0
        checkedOutCondition = try container.decodeIfPresent(Int.self, forKey: .checkedOutCondition)
        returnedCondition = try container.decodeIfPresent(Int.self, forKey: .returnedCondition)
        returnedAt = try container.decodeIfPresent(Date.self, forKey: .returnedAt)
        approvedAt = try container.decodeIfPresent(Date.self, forKey: .approvedAt)
        approvedByUserId = try container.decodeIfPresent(String.self, forKey: .approvedByUserId)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        inventoryItem = try container.decode(InventoryItem.self, forKey: .inventoryItem)
        approvedBy = try container.decodeIfPresent(UserSummary.self, forKey: .approvedBy)
    }
}

/// `Loan` + embedded `items` — verified against a live instance to be the SAME full shape on
/// both `GET /loans` (list) and `GET /loans/:id` (detail), unlike Inventory's split shapes.
nonisolated struct Loan: Codable, Identifiable, Sendable {
    let id: String
    /// The loan's primary display name, shown ahead of the borrower everywhere the loan is
    /// listed/exported.
    let subject: String
    let borrowerPersonId: String?
    let borrowerName: String?
    let borrowerStreet: String?
    let borrowerCity: String?
    let borrowerEmail: String?
    let borrowerPhone: String?
    let lentByUserId: String
    let source: String
    let checkoutDate: Date
    let dueDate: Date?
    let issuedAt: Date?
    let returnedAt: Date?
    let status: LoanStatus
    let notes: String?
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let lentBy: UserSummary?
    let items: [LoanItem]

    var borrowerDisplayName: String { borrowerName ?? "Unbekannt" }

    private enum CodingKeys: String, CodingKey {
        case id, subject, borrowerPersonId, borrowerName, borrowerStreet, borrowerCity,
             borrowerEmail, borrowerPhone, lentByUserId, source, checkoutDate, dueDate,
             issuedAt, returnedAt, status, notes, createdAt, updatedAt, deletedAt, lentBy, items
    }

    /// Custom decode so `subject` falls back to `""` (its backend default) when absent, instead
    /// of failing the whole decode — keeps the app working against a backend that hasn't rolled
    /// out this field yet.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        subject = try container.decodeIfPresent(String.self, forKey: .subject) ?? ""
        borrowerPersonId = try container.decodeIfPresent(String.self, forKey: .borrowerPersonId)
        borrowerName = try container.decodeIfPresent(String.self, forKey: .borrowerName)
        borrowerStreet = try container.decodeIfPresent(String.self, forKey: .borrowerStreet)
        borrowerCity = try container.decodeIfPresent(String.self, forKey: .borrowerCity)
        borrowerEmail = try container.decodeIfPresent(String.self, forKey: .borrowerEmail)
        borrowerPhone = try container.decodeIfPresent(String.self, forKey: .borrowerPhone)
        lentByUserId = try container.decode(String.self, forKey: .lentByUserId)
        source = try container.decode(String.self, forKey: .source)
        checkoutDate = try container.decode(Date.self, forKey: .checkoutDate)
        dueDate = try container.decodeIfPresent(Date.self, forKey: .dueDate)
        issuedAt = try container.decodeIfPresent(Date.self, forKey: .issuedAt)
        returnedAt = try container.decodeIfPresent(Date.self, forKey: .returnedAt)
        status = try container.decode(LoanStatus.self, forKey: .status)
        notes = try container.decodeIfPresent(String.self, forKey: .notes)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        deletedAt = try container.decodeIfPresent(Date.self, forKey: .deletedAt)
        lentBy = try container.decodeIfPresent(UserSummary.self, forKey: .lentBy)
        items = try container.decode([LoanItem].self, forKey: .items)
    }
}

nonisolated struct LoanTemplateItem: Codable, Identifiable, Sendable {
    let id: String
    let templateId: String
    let articleId: String
    let quantity: Int
    let article: Article
}

nonisolated struct LoanTemplate: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let notes: String?
    let createdById: String?
    let createdAt: Date
    let updatedAt: Date
    let items: [LoanTemplateItem]
}

nonisolated struct BlackoutPeriod: Codable, Identifiable, Sendable {
    let id: String
    let startDate: Date
    let endDate: Date
    let reason: String?
    let createdById: String?
    let createdAt: Date
}

/// `GET /loans/calendar` row — a lightweight summary, not a full `Loan`.
nonisolated struct CalendarLoanEntry: Codable, Identifiable, Sendable {
    let id: String
    let subject: String
    let borrowerName: String?
    let borrowerPersonId: String?
    let status: LoanStatus
    let checkoutDate: Date
    let dueDate: Date?
    let itemCount: Int

    private enum CodingKeys: String, CodingKey {
        case id, subject, borrowerName, borrowerPersonId, status, checkoutDate, dueDate, itemCount
    }

    /// Custom decode so `subject` falls back to `""` (its backend default) when absent, instead
    /// of failing the whole decode — keeps the app working against a backend that hasn't rolled
    /// out this field yet.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        subject = try container.decodeIfPresent(String.self, forKey: .subject) ?? ""
        borrowerName = try container.decodeIfPresent(String.self, forKey: .borrowerName)
        borrowerPersonId = try container.decodeIfPresent(String.self, forKey: .borrowerPersonId)
        status = try container.decode(LoanStatus.self, forKey: .status)
        checkoutDate = try container.decode(Date.self, forKey: .checkoutDate)
        dueDate = try container.decodeIfPresent(Date.self, forKey: .dueDate)
        itemCount = try container.decode(Int.self, forKey: .itemCount)
    }
}
