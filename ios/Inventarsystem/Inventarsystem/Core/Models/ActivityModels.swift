import Foundation

/// `movement` (a `StockMovement`) or `audit` (an `AuditLog` row) — the reference frontend's
/// "Aktivitäten" feed merges both sources into one cursor-paginated timeline; this app mirrors
/// that exactly rather than exposing the separate `audit.read`-gated `/audit` endpoint, since
/// the frontend itself never uses that dedicated view either.
nonisolated enum ActivitySource: String, Codable, Sendable {
    case audit
    case movement
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ActivitySource(rawValue: raw) ?? .unknown
    }
}

/// The slim Inventarobjekt reference embedded on a movement-sourced entry — verified against a
/// live instance to be `{id, inventoryNumber, article: {id, name}}`, not a full `InventoryItem`.
nonisolated struct ActivityInventoryItemRef: Codable, Sendable {
    let id: String
    let inventoryNumber: String?
    let article: ArticleSummary
}

/// `GET /activity` row — verified against a live instance for both `source` values.
nonisolated struct ActivityEntry: Codable, Identifiable, Sendable {
    let id: String
    let source: ActivitySource
    let createdAt: Date
    let typeLabel: String
    let entityType: String
    let entityId: String
    let description: String
    let inventoryItem: ActivityInventoryItemRef?
    let user: UserSummary?
}
