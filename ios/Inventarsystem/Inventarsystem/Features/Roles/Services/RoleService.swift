import Foundation

nonisolated protocol RoleServicing: Sendable {
    func fetchAll() async throws -> [Role]
    func create(name: String, description: String) async throws -> Role
    func update(id: String, name: String, description: String) async throws -> Role
    func delete(id: String) async throws
    func assignPermission(roleId: String, permissionId: String) async throws
    func removePermission(roleId: String, permissionId: String) async throws
}

nonisolated protocol PermissionServicing: Sendable {
    func fetchAll() async throws -> [Permission]
}

nonisolated struct RoleService: RoleServicing {
    private struct RoleBody: Encodable { let name: String; let description: String }
    private struct PermissionBody: Encodable { let permissionId: String }

    /// `GET /roles` — a plain (unpaginated) array, verified against a live instance.
    func fetchAll() async throws -> [Role] {
        try await APIClient.shared.request("roles")
    }

    func create(name: String, description: String) async throws -> Role {
        try await APIClient.shared.request("roles", method: "POST", body: RoleBody(name: name, description: description))
    }

    func update(id: String, name: String, description: String) async throws -> Role {
        try await APIClient.shared.request("roles/\(id)", method: "PUT", body: RoleBody(name: name, description: description))
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("roles/\(id)", method: "DELETE")
    }

    func assignPermission(roleId: String, permissionId: String) async throws {
        try await APIClient.shared.requestVoid("roles/\(roleId)/permissions", method: "POST", body: PermissionBody(permissionId: permissionId))
    }

    func removePermission(roleId: String, permissionId: String) async throws {
        try await APIClient.shared.requestVoid("roles/\(roleId)/permissions/\(permissionId)", method: "DELETE")
    }
}

nonisolated struct PermissionService: PermissionServicing {
    /// `GET /permissions` — a plain (unpaginated) array, verified against a live instance.
    func fetchAll() async throws -> [Permission] {
        try await APIClient.shared.request("permissions")
    }
}
