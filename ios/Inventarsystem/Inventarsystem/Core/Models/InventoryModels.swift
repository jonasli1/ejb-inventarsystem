import Foundation

/// `InventoryItem.status`. Includes a graceful `unknown` fallback so a future backend addition
/// can't crash decoding of an entire list — only that one item's status reads as unrecognized.
nonisolated enum InventoryStatus: String, Codable, Sendable, CaseIterable, Hashable {
    case available
    case borrowed
    case maintenance
    case defect
    case retired
    case installed
    case notLoanable
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = InventoryStatus(rawValue: raw) ?? .unknown
    }

    /// German label, matching `frontend/src/lib/status-labels.ts` verbatim.
    var label: String {
        switch self {
        case .available: return "Verfügbar"
        case .borrowed: return "Ausgeliehen"
        case .maintenance: return "Wartung"
        case .defect: return "Defekt"
        case .retired: return "Ausgemustert"
        case .installed: return "Fest installiert"
        case .notLoanable: return "Nicht verleihbar"
        case .unknown: return "Unbekannt"
        }
    }

    /// Statuses a user may pick directly from an edit form's status field — `retired` requires
    /// the `inventory.retire` permission (checked separately by the caller) and `borrowed` is
    /// only reachable through the loan issue/return workflow, matching
    /// `MANUALLY_ASSIGNABLE_INVENTORY_STATUSES` in the reference frontend.
    static var manuallyAssignable: [InventoryStatus] { [.available, .maintenance, .defect, .installed, .notLoanable] }
}

/// The slim shape the backend sends for `InventoryItem.parentItem` (an accessory's owner) —
/// verified against a live instance to be `{id, inventoryNumber, article: {id, name}}`, not a
/// full nested `InventoryItem`/`Article`.
nonisolated struct InventoryItemParentRef: Codable, Sendable, Hashable {
    let id: String
    let inventoryNumber: String?
    let article: ArticleSummary
}

/// The Inventarobjekt (physical unit) entity — references an `Article` (the catalog/product
/// type) plus its own location, two-tier owner, and lifecycle fields. Field set and embedded
/// relations verified against a live instance.
nonisolated struct InventoryItem: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let articleId: String
    let locationId: String
    let roomId: String
    let ownerOrganizationId: String
    let ownerUnitId: String
    /// Optional and never auto-generated; unique (case-insensitively) only among non-retired
    /// items — a retired item's number is freed for reuse.
    let inventoryNumber: String?
    let status: InventoryStatus
    let serialNumber: String?
    let purchasePrice: Decimal?
    let purchaseDate: Date?
    let nextDguvV3Check: Date?
    let notes: String?
    let parentItemId: String?
    /// Only meaningful while `parentItemId` is set: whether this accessory may also be checked
    /// out on its own, without its main object.
    let separatelyLoanable: Bool
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?

    let article: Article
    let location: Location
    let room: Room
    let ownerOrganization: Organization
    let ownerUnit: OrganizationUnit
    let parentItem: InventoryItemParentRef?

    /// What to show as the item's primary label when no inventory number is set — falls back
    /// to the Artikel name, matching the frontend's own display convention.
    var displayNumber: String { inventoryNumber ?? article.name }

    private enum CodingKeys: String, CodingKey {
        case id, articleId, locationId, roomId, ownerOrganizationId, ownerUnitId,
             inventoryNumber, status, serialNumber, purchasePrice, purchaseDate,
             nextDguvV3Check, notes, parentItemId, separatelyLoanable, createdAt, updatedAt,
             deletedAt, article, location, room, ownerOrganization, ownerUnit, parentItem
    }

    /// Custom decode so `separatelyLoanable` falls back to `false` (its backend default) when
    /// absent, instead of failing the whole decode — keeps the app working against a backend
    /// that hasn't rolled out this field yet.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        articleId = try container.decode(String.self, forKey: .articleId)
        locationId = try container.decode(String.self, forKey: .locationId)
        roomId = try container.decode(String.self, forKey: .roomId)
        ownerOrganizationId = try container.decode(String.self, forKey: .ownerOrganizationId)
        ownerUnitId = try container.decode(String.self, forKey: .ownerUnitId)
        inventoryNumber = try container.decodeIfPresent(String.self, forKey: .inventoryNumber)
        status = try container.decode(InventoryStatus.self, forKey: .status)
        serialNumber = try container.decodeIfPresent(String.self, forKey: .serialNumber)
        purchasePrice = try container.decodeIfPresent(Decimal.self, forKey: .purchasePrice)
        purchaseDate = try container.decodeIfPresent(Date.self, forKey: .purchaseDate)
        nextDguvV3Check = try container.decodeIfPresent(Date.self, forKey: .nextDguvV3Check)
        notes = try container.decodeIfPresent(String.self, forKey: .notes)
        parentItemId = try container.decodeIfPresent(String.self, forKey: .parentItemId)
        separatelyLoanable = try container.decodeIfPresent(Bool.self, forKey: .separatelyLoanable) ?? false
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        deletedAt = try container.decodeIfPresent(Date.self, forKey: .deletedAt)
        article = try container.decode(Article.self, forKey: .article)
        location = try container.decode(Location.self, forKey: .location)
        room = try container.decode(Room.self, forKey: .room)
        ownerOrganization = try container.decode(Organization.self, forKey: .ownerOrganization)
        ownerUnit = try container.decode(OrganizationUnit.self, forKey: .ownerUnit)
        parentItem = try container.decodeIfPresent(InventoryItemParentRef.self, forKey: .parentItem)
    }
}

/// `GET /inventory/:id` (detail) response — verified against a live instance to be a full
/// `InventoryItem` plus a top-level `accessories` array not present on list rows. Decodes by
/// feeding the same decoder into `InventoryItem`'s own synthesized init and separately picking
/// up `accessories`, rather than duplicating every field (same pattern as `ArticleListItem`).
nonisolated struct InventoryItemDetail: Decodable, Identifiable, Sendable {
    let item: InventoryItem
    let accessories: [InventoryItem]

    var id: String { item.id }

    private enum SideKeys: String, CodingKey { case accessories }

    init(from decoder: Decoder) throws {
        item = try InventoryItem(from: decoder)
        let container = try decoder.container(keyedBy: SideKeys.self)
        accessories = try container.decodeIfPresent([InventoryItem].self, forKey: .accessories) ?? []
    }
}

/// `GET /inventory/:id/accessory-candidates` row — verified against a live instance to be a
/// **full** `InventoryItem` plus `eligible`/`reason` (not a slim summary). Every matching item
/// is returned, including ineligible ones, each carrying a ready-to-display German reason so
/// the picker can render a grayed-out row instead of silently filtering candidates out.
nonisolated struct AccessoryCandidate: Decodable, Identifiable, Sendable {
    let item: InventoryItem
    let eligible: Bool
    let reason: String?

    var id: String { item.id }

    private enum SideKeys: String, CodingKey { case eligible, reason }

    init(from decoder: Decoder) throws {
        item = try InventoryItem(from: decoder)
        let container = try decoder.container(keyedBy: SideKeys.self)
        eligible = try container.decode(Bool.self, forKey: .eligible)
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
    }
}

/// `GET /inventory?grouped=true` row: one Artikel with its aggregated stock and every unit.
nonisolated struct GroupedInventoryEntry: Decodable, Identifiable, Sendable {
    let article: Article
    let stock: StockSummary
    let units: [InventoryItem]

    var id: String { article.id }
}

/// `StockMovement.type` — see `schema.prisma`'s `StockMovementType` enum.
nonisolated enum StockMovementType: String, Codable, Sendable {
    case inbound = "in"
    case outbound = "out"
    case move
    case adjust
    case statusChange = "status_change"
    case conditionChange = "condition_change"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StockMovementType(rawValue: raw) ?? .unknown
    }

    var label: String {
        switch self {
        case .inbound: return "Zugang"
        case .outbound: return "Abgang"
        case .move: return "Umlagerung"
        case .adjust: return "Anpassung"
        case .statusChange: return "Statusänderung"
        case .conditionChange: return "Zustandsänderung"
        case .unknown: return "Sonstige Änderung"
        }
    }
}

nonisolated struct UserSummary: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let displayName: String
}

/// `GET /inventory/:id/movements` row — an item's move/status history, verified against a live
/// instance (a plain array, newest first).
nonisolated struct StockMovement: Codable, Identifiable, Sendable {
    let id: String
    let inventoryItemId: String
    let type: StockMovementType
    let fromRoomId: String?
    let toRoomId: String?
    let oldStatus: InventoryStatus?
    let newStatus: InventoryStatus?
    let oldCondition: Int?
    let newCondition: Int?
    let userId: String?
    let loanItemId: String?
    let createdAt: Date
    let note: String?
    let fromRoom: Room?
    let toRoom: Room?
    let user: UserSummary?
}
