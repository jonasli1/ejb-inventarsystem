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
    let checkedOutCondition: Int?
    let returnedCondition: Int?
    let returnedAt: Date?
    let approvedAt: Date?
    let approvedByUserId: String?
    let createdAt: Date
    let inventoryItem: InventoryItem
    let approvedBy: UserSummary?
}

/// `Loan` + embedded `items` — verified against a live instance to be the SAME full shape on
/// both `GET /loans` (list) and `GET /loans/:id` (detail), unlike Inventory's split shapes.
nonisolated struct Loan: Codable, Identifiable, Sendable {
    let id: String
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
    let borrowerName: String?
    let borrowerPersonId: String?
    let status: LoanStatus
    let checkoutDate: Date
    let dueDate: Date?
    let itemCount: Int
}
