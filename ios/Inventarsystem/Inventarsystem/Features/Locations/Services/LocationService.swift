import Foundation

nonisolated protocol LocationServicing: Sendable {
    func fetchAll() async throws -> [Location]
    func create(name: String, address: String) async throws -> Location
    func update(id: String, name: String, address: String) async throws -> Location
    func delete(id: String) async throws
    func createRoom(locationId: String, name: String) async throws -> Room
    func updateRoom(id: String, name: String) async throws -> Room
    func deleteRoom(id: String) async throws
}

nonisolated struct LocationService: LocationServicing {
    private struct LocationBody: Encodable { let name: String; let address: String }
    private struct RoomBody: Encodable { let locationId: String?; let name: String }

    /// `GET /locations` — a plain, unpaginated array with rooms already embedded (verified
    /// against a live instance).
    func fetchAll() async throws -> [Location] {
        try await APIClient.shared.request("locations")
    }

    func create(name: String, address: String) async throws -> Location {
        try await APIClient.shared.request("locations", method: "POST", body: LocationBody(name: name, address: address))
    }

    func update(id: String, name: String, address: String) async throws -> Location {
        try await APIClient.shared.request("locations/\(id)", method: "PUT", body: LocationBody(name: name, address: address))
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("locations/\(id)", method: "DELETE")
    }

    func createRoom(locationId: String, name: String) async throws -> Room {
        try await APIClient.shared.request("rooms", method: "POST", body: RoomBody(locationId: locationId, name: name))
    }

    func updateRoom(id: String, name: String) async throws -> Room {
        try await APIClient.shared.request("rooms/\(id)", method: "PUT", body: RoomBody(locationId: nil, name: name))
    }

    func deleteRoom(id: String) async throws {
        try await APIClient.shared.requestVoid("rooms/\(id)", method: "DELETE")
    }
}
