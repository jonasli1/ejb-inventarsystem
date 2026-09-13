import Foundation

nonisolated protocol GroupServicing: Sendable {
    func fetchAll(page: Int, pageSize: Int) async throws -> (items: [AppGroup], meta: PageMeta)
    func create(name: String, description: String) async throws -> AppGroup
    func update(id: String, name: String, description: String) async throws -> AppGroup
    func delete(id: String) async throws
    func fetchRoles(groupId: String) async throws -> [Role]
    func assignRole(groupId: String, roleId: String) async throws
    func removeRole(groupId: String, roleId: String) async throws
    func fetchOrganizationScopes(groupId: String) async throws -> [GroupOrganizationScope]
    func addOrganizationScope(groupId: String, organizationId: String, organizationUnitId: String?) async throws
    func removeOrganizationScope(groupId: String, scopeId: String) async throws
}

nonisolated struct GroupService: GroupServicing {
    private struct GroupBody: Encodable { let name: String; let description: String }
    private struct RoleBody: Encodable { let roleId: String }
    private struct ScopeBody: Encodable { let organizationId: String; let organizationUnitId: String? }

    func fetchAll(page: Int = 1, pageSize: Int = 25) async throws -> (items: [AppGroup], meta: PageMeta) {
        let result: OffsetPage<AppGroup> = try await APIClient.shared.request(
            "groups", query: [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "pageSize", value: String(pageSize))]
        )
        return (result.data, result.meta)
    }

    func create(name: String, description: String) async throws -> AppGroup {
        try await APIClient.shared.request("groups", method: "POST", body: GroupBody(name: name, description: description))
    }

    func update(id: String, name: String, description: String) async throws -> AppGroup {
        try await APIClient.shared.request("groups/\(id)", method: "PUT", body: GroupBody(name: name, description: description))
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("groups/\(id)", method: "DELETE")
    }

    func fetchRoles(groupId: String) async throws -> [Role] {
        try await APIClient.shared.request("groups/\(groupId)/roles")
    }

    func assignRole(groupId: String, roleId: String) async throws {
        try await APIClient.shared.requestVoid("groups/\(groupId)/roles", method: "POST", body: RoleBody(roleId: roleId))
    }

    func removeRole(groupId: String, roleId: String) async throws {
        try await APIClient.shared.requestVoid("groups/\(groupId)/roles/\(roleId)", method: "DELETE")
    }

    func fetchOrganizationScopes(groupId: String) async throws -> [GroupOrganizationScope] {
        try await APIClient.shared.request("groups/\(groupId)/organization-scopes")
    }

    func addOrganizationScope(groupId: String, organizationId: String, organizationUnitId: String?) async throws {
        try await APIClient.shared.requestVoid(
            "groups/\(groupId)/organization-scopes", method: "POST",
            body: ScopeBody(organizationId: organizationId, organizationUnitId: organizationUnitId)
        )
    }

    func removeOrganizationScope(groupId: String, scopeId: String) async throws {
        try await APIClient.shared.requestVoid("groups/\(groupId)/organization-scopes/\(scopeId)", method: "DELETE")
    }
}
