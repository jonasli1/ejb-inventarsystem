import Foundation
import Observation

/// Drives one role's detail screen: editable name/description, plus the full permission
/// checklist (grouped by `PermissionGroup` in the view). There is no `GET /roles/:id` in
/// `RoleServicing` — only the plain-array `fetchAll()` — so "reload the role" throughout this
/// class means re-fetching the full list and picking this role out by id, same as the
/// reference frontend's own `queryClient.invalidateQueries({ queryKey: ['roles'] })` pattern.
@MainActor
@Observable
final class RoleDetailViewModel {
    private(set) var role: Role
    private(set) var allPermissions: [Permission] = []
    private(set) var isLoading = false
    private(set) var isSaving = false
    private(set) var isDeleted = false
    var errorMessage: String?

    var isEditing = false
    var editName = ""
    var editDescription = ""

    private let roleService: RoleServicing
    private let permissionService: PermissionServicing

    init(
        role: Role,
        roleService: RoleServicing = RoleService(),
        permissionService: PermissionServicing = PermissionService()
    ) {
        self.role = role
        self.roleService = roleService
        self.permissionService = permissionService
    }

    /// Loads the permission catalog for the checklist and refreshes `role` from the server so
    /// the screen reflects the current permission set even if it changed elsewhere.
    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let permissionsResult = permissionService.fetchAll()
            async let rolesResult = roleService.fetchAll()
            let permissions = try await permissionsResult
            let roles = try await rolesResult
            allPermissions = permissions
            if let updated = roles.first(where: { $0.id == role.id }) {
                role = updated
            }
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rolle konnte nicht geladen werden."
        }
    }

    /// The permissions belonging to one `PermissionGroup`, sorted by display label — used to
    /// build one `Section` per group in the checklist.
    func permissions(in group: PermissionGroup) -> [Permission] {
        allPermissions
            .filter { PermissionGroup.group(forKey: $0.key) == group }
            .sorted { ($0.displayName ?? $0.key) < ($1.displayName ?? $1.key) }
    }

    func isAssigned(_ permission: Permission) -> Bool {
        role.permissions.contains { $0.id == permission.id }
    }

    func beginEditing() {
        editName = role.name
        editDescription = role.description ?? ""
        isEditing = true
    }

    func cancelEditing() {
        isEditing = false
    }

    func saveEdits() async -> Bool {
        isSaving = true
        defer { isSaving = false }
        do {
            role = try await roleService.update(id: role.id, name: editName, description: editDescription)
            isEditing = false
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rolle konnte nicht aktualisiert werden."
            return false
        }
    }

    /// Assigns or removes one permission immediately (no separate save step), then reloads
    /// `role` from the server so the checklist always reflects the actual current set rather
    /// than an optimistic local guess.
    func togglePermission(_ permission: Permission) async {
        do {
            if isAssigned(permission) {
                try await roleService.removePermission(roleId: role.id, permissionId: permission.id)
            } else {
                try await roleService.assignPermission(roleId: role.id, permissionId: permission.id)
            }
            await reloadRole()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Berechtigung konnte nicht geändert werden."
        }
    }

    /// Guarded here too (in addition to the view hiding/disabling the delete control) so a
    /// protected role can never be deleted regardless of how this method is invoked.
    func delete() async {
        guard role.name != protectedRoleName else { return }
        do {
            try await roleService.delete(id: role.id)
            isDeleted = true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rolle konnte nicht gelöscht werden."
        }
    }

    private func reloadRole() async {
        if let updated = (try? await roleService.fetchAll())?.first(where: { $0.id == role.id }) {
            role = updated
        }
    }
}
