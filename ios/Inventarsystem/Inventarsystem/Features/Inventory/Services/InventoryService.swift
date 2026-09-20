import Foundation

nonisolated protocol InventoryServicing: Sendable {
    /// The flat list is keyset/cursor-paginated and has no cheap `meta.total` at scale — the
    /// Dashboard's "Inventar" tile uses this dedicated endpoint instead, matching the frontend.
    func count() async throws -> Int
    func fetchFlat(cursor: String?, limit: Int, filters: InventoryFilters) async throws -> (items: [InventoryItem], nextCursor: String?)
    func fetchGrouped(page: Int, pageSize: Int, filters: InventoryFilters) async throws -> (items: [GroupedInventoryEntry], meta: PageMeta)
    func fetchDetail(id: String) async throws -> InventoryItemDetail
    func fetchMovements(id: String) async throws -> [StockMovement]
    func fetchAccessoryCandidates(itemId: String, search: String, page: Int, pageSize: Int) async throws -> (items: [AccessoryCandidate], meta: PageMeta)
    func create(_ input: CreateInventoryItemInput) async throws -> InventoryItem
    func update(id: String, input: UpdateInventoryItemInput) async throws -> InventoryItem
    func move(id: String, toRoomId: String, note: String?) async throws -> InventoryItem
    func assignAccessory(itemId: String, accessoryItemId: String, separatelyLoanable: Bool) async throws
    func removeAccessory(itemId: String, accessoryId: String) async throws
    func setSeparatelyLoanable(itemId: String, separatelyLoanable: Bool) async throws
    func delete(id: String) async throws
}

/// Shared filter set for both pagination modes of `GET /inventory` — the endpoint's `grouped`
/// flag switches response shape/pagination style, not the filter parameters, which stay the same.
nonisolated struct InventoryFilters: Sendable, Equatable {
    var articleId: String?
    var categoryId: String?
    var locationId: String?
    var roomId: String?
    var status: InventoryStatus?
    var ownerOrganizationId: String?
    var ownerUnitId: String?
    var search: String?

    init(
        articleId: String? = nil,
        categoryId: String? = nil,
        locationId: String? = nil,
        roomId: String? = nil,
        status: InventoryStatus? = nil,
        ownerOrganizationId: String? = nil,
        ownerUnitId: String? = nil,
        search: String? = nil
    ) {
        self.articleId = articleId
        self.categoryId = categoryId
        self.locationId = locationId
        self.roomId = roomId
        self.status = status
        self.ownerOrganizationId = ownerOrganizationId
        self.ownerUnitId = ownerUnitId
        self.search = search
    }

    fileprivate func queryItems() -> [URLQueryItem] {
        var items: [URLQueryItem] = []
        if let articleId { items.append(.init(name: "articleId", value: articleId)) }
        if let categoryId { items.append(.init(name: "categoryId", value: categoryId)) }
        if let locationId { items.append(.init(name: "locationId", value: locationId)) }
        if let roomId { items.append(.init(name: "roomId", value: roomId)) }
        if let status { items.append(.init(name: "status", value: status.rawValue)) }
        if let ownerOrganizationId { items.append(.init(name: "ownerOrganizationId", value: ownerOrganizationId)) }
        if let ownerUnitId { items.append(.init(name: "ownerUnitId", value: ownerUnitId)) }
        if let search, !search.isEmpty { items.append(.init(name: "search", value: search)) }
        return items
    }
}

/// `POST /inventory` body. `locationId`/`roomId` are required here only — updates move a room
/// via the separate `/move` endpoint instead (`UpdateInventoryItemDto` doesn't accept them, and
/// the backend's whitelist validation would reject the extra keys).
nonisolated struct CreateInventoryItemInput: Encodable, Sendable {
    var articleId: String
    var locationId: String
    var roomId: String
    var ownerOrganizationId: String
    var ownerUnitId: String
    var inventoryNumber: String = ""
    var status: InventoryStatus?
    var serialNumber: String = ""
    var notes: String = ""
    var purchasePrice: Decimal?
    var purchaseDate: Date?
    var nextDguvV3Check: Date?

    private enum CodingKeys: String, CodingKey {
        case articleId, locationId, roomId, ownerOrganizationId, ownerUnitId, inventoryNumber,
             status, serialNumber, notes, purchasePrice, purchaseDate, nextDguvV3Check
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(articleId, forKey: .articleId)
        try container.encode(locationId, forKey: .locationId)
        try container.encode(roomId, forKey: .roomId)
        try container.encode(ownerOrganizationId, forKey: .ownerOrganizationId)
        try container.encode(ownerUnitId, forKey: .ownerUnitId)
        // Verified against a live instance: an empty string is accepted and normalized to
        // null server-side — the inventory number and these other fields are genuinely
        // optional/clearable, per the task's requirements.
        try container.encode(inventoryNumber, forKey: .inventoryNumber)
        try container.encodeIfPresent(status?.rawValue, forKey: .status)
        try container.encode(serialNumber, forKey: .serialNumber)
        try container.encode(notes, forKey: .notes)
        try container.encodeIfPresent(purchasePrice, forKey: .purchasePrice)
        // Verified against a live instance: date fields need an explicit `null` to clear —
        // unlike strings, an empty string is REJECTED by the date validator (400).
        try encodeOrNull(purchaseDate, forKey: .purchaseDate, into: &container)
        try encodeOrNull(nextDguvV3Check, forKey: .nextDguvV3Check, into: &container)
    }
}

/// `PUT /inventory/:id` body.
///
/// **Important, verified against a live instance (not documented anywhere, easy to get wrong):**
/// the backend's per-field permission checks key off whether a field is *present in the request
/// body at all* — not whether its value actually differs from the current one. Resending a
/// user's own unchanged `inventoryNumber` still 403s with `MISSING_PERMISSION` for a user who
/// lacks `inventory.change_inventory_number`. So `inventoryNumber` and `status` (which needs
/// `inventory.retire` specifically when moving *to* `retired`) MUST be omitted whenever the
/// caller isn't intentionally changing them — never populate them "just in case" from the
/// current value. Every other field only requires the general `inventory.update` permission
/// (needed to call this endpoint at all), so they're safe to always include; the two date
/// fields specifically need an explicit `null` to clear (an empty string 400s on them, unlike
/// plain string fields).
nonisolated struct UpdateInventoryItemInput: Encodable, Sendable {
    var ownerOrganizationId: String
    var ownerUnitId: String
    /// Omit entirely unless the user has `inventory.change_inventory_number` AND is actually
    /// editing this field — see the type-level note.
    var inventoryNumber: String?
    /// Omit entirely unless the user is actually changing status — see the type-level note.
    var status: InventoryStatus?
    var serialNumber: String = ""
    var notes: String = ""
    var purchasePrice: Decimal?
    var purchaseDate: Date?
    var nextDguvV3Check: Date?

    private enum CodingKeys: String, CodingKey {
        case ownerOrganizationId, ownerUnitId, inventoryNumber, status, serialNumber, notes,
             purchasePrice, purchaseDate, nextDguvV3Check
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(ownerOrganizationId, forKey: .ownerOrganizationId)
        try container.encode(ownerUnitId, forKey: .ownerUnitId)
        try container.encodeIfPresent(inventoryNumber, forKey: .inventoryNumber)
        try container.encodeIfPresent(status?.rawValue, forKey: .status)
        try container.encode(serialNumber, forKey: .serialNumber)
        try container.encode(notes, forKey: .notes)
        try encodeOrNull(purchasePrice, forKey: .purchasePrice, into: &container)
        try encodeOrNull(purchaseDate, forKey: .purchaseDate, into: &container)
        try encodeOrNull(nextDguvV3Check, forKey: .nextDguvV3Check, into: &container)
    }
}

/// Writes an explicit JSON `null` for a cleared optional value, or the encoded value itself —
/// used instead of `encodeIfPresent`, which would silently omit the key for `nil` (meaning
/// "leave unchanged" server-side for these fields) rather than clearing it. Verified against a
/// live instance for both `Date` and `Decimal` fields: an empty string 400s, explicit `null` works.
private nonisolated func encodeOrNull<Key: CodingKey, T: Encodable>(
    _ value: T?,
    forKey key: Key,
    into container: inout KeyedEncodingContainer<Key>
) throws {
    if let value {
        try container.encode(value, forKey: key)
    } else {
        try container.encodeNil(forKey: key)
    }
}

nonisolated struct InventoryService: InventoryServicing {
    private struct CountResponse: Decodable { let count: Int }

    func count() async throws -> Int {
        let response: CountResponse = try await APIClient.shared.request("inventory/count")
        return response.count
    }

    func fetchFlat(cursor: String?, limit: Int, filters: InventoryFilters) async throws -> (items: [InventoryItem], nextCursor: String?) {
        var query = filters.queryItems()
        query.append(URLQueryItem(name: "limit", value: String(limit)))
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        let page: CursorPage<InventoryItem> = try await APIClient.shared.request("inventory", query: query)
        return (page.data, page.nextCursor)
    }

    func fetchGrouped(page: Int, pageSize: Int, filters: InventoryFilters) async throws -> (items: [GroupedInventoryEntry], meta: PageMeta) {
        var query = filters.queryItems()
        query.append(contentsOf: [
            URLQueryItem(name: "grouped", value: "true"),
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "pageSize", value: String(pageSize))
        ])
        let result: OffsetPage<GroupedInventoryEntry> = try await APIClient.shared.request("inventory", query: query)
        return (result.data, result.meta)
    }

    func fetchDetail(id: String) async throws -> InventoryItemDetail {
        try await APIClient.shared.request("inventory/\(id)")
    }

    func fetchMovements(id: String) async throws -> [StockMovement] {
        try await APIClient.shared.request("inventory/\(id)/movements")
    }

    func fetchAccessoryCandidates(itemId: String, search: String, page: Int, pageSize: Int) async throws -> (items: [AccessoryCandidate], meta: PageMeta) {
        var query = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "pageSize", value: String(pageSize))]
        if !search.isEmpty { query.append(URLQueryItem(name: "search", value: search)) }
        let result: OffsetPage<AccessoryCandidate> = try await APIClient.shared.request("inventory/\(itemId)/accessory-candidates", query: query)
        return (result.data, result.meta)
    }

    func create(_ input: CreateInventoryItemInput) async throws -> InventoryItem {
        try await APIClient.shared.request("inventory", method: "POST", body: input)
    }

    func update(id: String, input: UpdateInventoryItemInput) async throws -> InventoryItem {
        try await APIClient.shared.request("inventory/\(id)", method: "PUT", body: input)
    }

    func move(id: String, toRoomId: String, note: String?) async throws -> InventoryItem {
        struct MoveBody: Encodable { let toRoomId: String; let note: String? }
        return try await APIClient.shared.request("inventory/\(id)/move", method: "POST", body: MoveBody(toRoomId: toRoomId, note: note))
    }

    func assignAccessory(itemId: String, accessoryItemId: String, separatelyLoanable: Bool) async throws {
        struct Body: Encodable { let accessoryItemId: String; let separatelyLoanable: Bool }
        let _: InventoryItem = try await APIClient.shared.request(
            "inventory/\(itemId)/accessory", method: "PUT",
            body: Body(accessoryItemId: accessoryItemId, separatelyLoanable: separatelyLoanable)
        )
    }

    func removeAccessory(itemId: String, accessoryId: String) async throws {
        try await APIClient.shared.requestVoid("inventory/\(itemId)/accessory/\(accessoryId)", method: "DELETE")
    }

    func setSeparatelyLoanable(itemId: String, separatelyLoanable: Bool) async throws {
        struct Body: Encodable { let separatelyLoanable: Bool }
        let _: InventoryItem = try await APIClient.shared.request(
            "inventory/\(itemId)", method: "PUT", body: Body(separatelyLoanable: separatelyLoanable)
        )
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("inventory/\(id)", method: "DELETE")
    }
}
