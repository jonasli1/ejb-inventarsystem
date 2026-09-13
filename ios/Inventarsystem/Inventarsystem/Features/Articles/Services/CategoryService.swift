import Foundation

nonisolated protocol CategoryServicing: Sendable {
    func fetchAll() async throws -> [Category]
    func create(name: String, parentId: String?) async throws -> Category
    func update(id: String, name: String, parentId: String?) async throws -> Category
    func delete(id: String) async throws
}

nonisolated struct CategoryService: CategoryServicing {
    private struct Body: Encodable { let name: String; let parentId: String? }

    /// `GET /categories` — a plain (unpaginated), self-referencing-tree array, verified against
    /// a live instance.
    func fetchAll() async throws -> [Category] {
        try await APIClient.shared.request("categories")
    }

    func create(name: String, parentId: String?) async throws -> Category {
        try await APIClient.shared.request("categories", method: "POST", body: Body(name: name, parentId: parentId))
    }

    func update(id: String, name: String, parentId: String?) async throws -> Category {
        try await APIClient.shared.request("categories/\(id)", method: "PUT", body: Body(name: name, parentId: parentId))
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("categories/\(id)", method: "DELETE")
    }
}
