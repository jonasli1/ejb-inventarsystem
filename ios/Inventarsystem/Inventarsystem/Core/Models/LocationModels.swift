import Foundation

nonisolated struct Room: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let locationId: String
    let name: String
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
}

/// `GET /locations` returns a plain (unpaginated) array, each with its rooms already embedded
/// — verified against a live instance. This directly matches the frontend's Standorte→Räume
/// master-detail screen without a second round trip for the common case.
nonisolated struct Location: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
    let address: String?
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let rooms: [Room]?

    static func == (lhs: Location, rhs: Location) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
