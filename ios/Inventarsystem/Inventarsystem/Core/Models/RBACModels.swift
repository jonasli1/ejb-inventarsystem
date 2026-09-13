import Foundation

// MARK: - Permissions

nonisolated struct Permission: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let key: String
    let displayName: String?
    let description: String?
}

/// The ~44 fine-grained permission keys, grouped exactly as `frontend/src/lib/permission-
/// labels.ts` groups them, for a settings/roles UI that mirrors the web app's own grouping.
nonisolated enum PermissionGroup: String, CaseIterable, Sendable {
    case articles = "Artikel"
    case inventory = "Inventarobjekte"
    case loans = "Ausleihen"
    case locations = "Standorte"
    case organizations = "Organisationen"
    case users = "Personen"
    case rolesAndPermissions = "Rollen & Rechte"
    case groups = "Gruppen"
    case settingsAndReports = "Einstellungen & Berichte"
    case audit = "Protokoll"
    case other = "Sonstiges"

    static func group(forKey key: String) -> PermissionGroup {
        let prefix = key.split(separator: ".").first.map(String.init) ?? ""
        switch prefix {
        case "articles": return .articles
        case "inventory": return .inventory
        case "loans": return .loans
        case "locations": return .locations
        case "organizations": return .organizations
        case "users": return .users
        case "roles", "permissions": return .rolesAndPermissions
        case "groups": return .groups
        case "settings", "reports": return .settingsAndReports
        case "audit": return .audit
        default: return .other
        }
    }
}

// MARK: - Roles

nonisolated struct RolePermissionLink: Codable, Sendable {
    let permissionId: String
    let permission: Permission
}

/// `GET /roles` row shape, verified against a live instance: permissions arrive wrapped in a
/// join-row (`rolePermissions: [{permission: Permission, ...}]`), not a flat `permissions` array.
nonisolated struct Role: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
    let description: String?
    let createdAt: Date
    let updatedAt: Date
    let rolePermissions: [RolePermissionLink]?

    var permissions: [Permission] { rolePermissions?.map(\.permission) ?? [] }

    static func == (lhs: Role, rhs: Role) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    private enum CodingKeys: String, CodingKey {
        case id, name, description, createdAt, updatedAt, rolePermissions
    }
}

/// The literal role name the backend/frontend both treat as protected (cannot be deleted, its
/// permission set shouldn't be casually stripped) — `PROTECTED_ROLE_NAME` in the reference frontend.
nonisolated let protectedRoleName = "Admin"

// MARK: - Groups

nonisolated struct GroupOrganizationScope: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let groupId: String
    let organizationId: String
    let organizationUnitId: String?
    let organization: Organization
    let organizationUnit: OrganizationUnit?

    static func == (lhs: GroupOrganizationScope, rhs: GroupOrganizationScope) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

nonisolated struct AppGroup: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
    /// Non-nil for a group synced from ChurchTools; nil for a manually created one.
    let externalRef: String?
    let description: String?
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let organizationScopes: [GroupOrganizationScope]?

    var isFromChurchTools: Bool { externalRef != nil }

    static func == (lhs: AppGroup, rhs: AppGroup) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

nonisolated struct UserGroupMembership: Codable, Identifiable, Sendable {
    let id: String
    let userId: String
    let groupId: String
    /// `"churchtools"` memberships are synced automatically on every ChurchTools login and
    /// must never be removed through the manual assignment endpoints; only `"manual"` ones can.
    let source: String
    let group: AppGroup
}

// MARK: - Users

nonisolated struct AuthIdentitySummary: Codable, Sendable {
    let provider: String
    let createdAt: Date
    let deviceLabel: String?
}

nonisolated struct UserRoleLink: Codable, Sendable {
    let roleId: String
    let source: String
    let role: RoleSummary
}

/// `GET /users` row shape — no embedded roles/groups at list level (those need
/// `GET /users/:id` or `GET /users/:id/groups`).
nonisolated struct User: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let displayName: String
    let email: String
    let isActive: Bool
    let themePreference: String
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?

    static func == (lhs: User, rhs: User) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// `GET /users/:id` — a full `User` plus `authIdentities`/`userRoles`, verified against a live
/// instance. Decodes via the same composition pattern as `ArticleListItem`.
nonisolated struct UserDetail: Decodable, Identifiable, Sendable {
    let user: User
    let authIdentities: [AuthIdentitySummary]
    let userRoles: [UserRoleLink]

    var id: String { user.id }

    private enum SideKeys: String, CodingKey { case authIdentities, userRoles }

    init(from decoder: Decoder) throws {
        user = try User(from: decoder)
        let container = try decoder.container(keyedBy: SideKeys.self)
        authIdentities = try container.decodeIfPresent([AuthIdentitySummary].self, forKey: .authIdentities) ?? []
        userRoles = try container.decodeIfPresent([UserRoleLink].self, forKey: .userRoles) ?? []
    }
}
