import Foundation

/// Tier 2 of the "two-tier owner" model — must belong to the `Organization` named by
/// `organizationId` (enforced server-side).
nonisolated struct OrganizationUnit: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let organizationId: String
    let name: String
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
}

/// Tier 1 of the "two-tier owner" model (`zweistufiger Eigentümer`). Every `InventoryItem`
/// carries both an `ownerOrganizationId` and an `ownerUnitId`.
nonisolated struct Organization: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let units: [OrganizationUnit]?

    static func == (lhs: Organization, rhs: Organization) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
