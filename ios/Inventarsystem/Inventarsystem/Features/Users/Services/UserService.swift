import Foundation

nonisolated protocol UserServicing: Sendable {
    func fetchAll(search: String?, page: Int, pageSize: Int) async throws -> (items: [User], meta: PageMeta)
    func fetchDetail(id: String) async throws -> UserDetail
    func fetchGroups(id: String) async throws -> [UserGroupMembership]
    func create(email: String, displayName: String, password: String?) async throws -> User
    func update(id: String, displayName: String, isActive: Bool) async throws -> User
    func delete(id: String) async throws
    func resetPassword(id: String, newPassword: String) async throws
    func changeEmail(id: String, email: String) async throws
    func assignRole(userId: String, roleId: String) async throws
    func removeRole(userId: String, roleId: String) async throws
    func addToGroup(userId: String, groupId: String) async throws
    func removeFromGroup(userId: String, groupId: String) async throws
}

nonisolated struct UserService: UserServicing {
    private struct CreateBody: Encodable { let email: String; let displayName: String; let password: String? }
    private struct UpdateBody: Encodable { let displayName: String; let isActive: Bool }
    private struct PasswordBody: Encodable { let newPassword: String }
    private struct EmailBody: Encodable { let email: String }
    private struct RoleBody: Encodable { let roleId: String }
    private struct GroupBody: Encodable { let groupId: String }

    func fetchAll(search: String?, page: Int = 1, pageSize: Int = 25) async throws -> (items: [User], meta: PageMeta) {
        var query = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "pageSize", value: String(pageSize))]
        if let search, !search.isEmpty { query.append(URLQueryItem(name: "search", value: search)) }
        let result: OffsetPage<User> = try await APIClient.shared.request("users", query: query)
        return (result.data, result.meta)
    }

    func fetchDetail(id: String) async throws -> UserDetail {
        try await APIClient.shared.request("users/\(id)")
    }

    func fetchGroups(id: String) async throws -> [UserGroupMembership] {
        try await APIClient.shared.request("users/\(id)/groups")
    }

    func create(email: String, displayName: String, password: String?) async throws -> User {
        try await APIClient.shared.request("users", method: "POST", body: CreateBody(email: email, displayName: displayName, password: password))
    }

    func update(id: String, displayName: String, isActive: Bool) async throws -> User {
        try await APIClient.shared.request("users/\(id)", method: "PUT", body: UpdateBody(displayName: displayName, isActive: isActive))
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("users/\(id)", method: "DELETE")
    }

    func resetPassword(id: String, newPassword: String) async throws {
        try await APIClient.shared.requestVoid("users/\(id)/reset-password", method: "POST", body: PasswordBody(newPassword: newPassword))
    }

    func changeEmail(id: String, email: String) async throws {
        try await APIClient.shared.requestVoid("users/\(id)/email", method: "PUT", body: EmailBody(email: email))
    }

    func assignRole(userId: String, roleId: String) async throws {
        try await APIClient.shared.requestVoid("users/\(userId)/roles", method: "POST", body: RoleBody(roleId: roleId))
    }

    func removeRole(userId: String, roleId: String) async throws {
        try await APIClient.shared.requestVoid("users/\(userId)/roles/\(roleId)", method: "DELETE")
    }

    func addToGroup(userId: String, groupId: String) async throws {
        try await APIClient.shared.requestVoid("users/\(userId)/groups", method: "POST", body: GroupBody(groupId: groupId))
    }

    func removeFromGroup(userId: String, groupId: String) async throws {
        try await APIClient.shared.requestVoid("users/\(userId)/groups/\(groupId)", method: "DELETE")
    }
}
