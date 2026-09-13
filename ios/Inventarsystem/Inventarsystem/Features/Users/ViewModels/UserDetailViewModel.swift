import Foundation
import Observation

/// Drives the Personen detail screen. `UserDetail` (profile + auth identities + roles) and
/// group memberships are two separate backend reads (`GET /users/:id` vs.
/// `GET /users/:id/groups`), so `load()` fetches both but keeps them as separate stored
/// properties rather than forcing them into one combined model.
@MainActor
@Observable
final class UserDetailViewModel {
    let userId: String

    private(set) var detail: UserDetail?
    private(set) var groupMemberships: [UserGroupMembership] = []
    /// The full roles/groups vocabularies, used to populate the "hinzufügen" pickers — fetched
    /// once and cached, matching `OrganizationService.fetchAll()`'s reasoning: a small,
    /// admin-managed vocabulary in practice, not worth a second paging UI just for a picker.
    private(set) var availableRoles: [Role] = []
    private(set) var availableGroups: [AppGroup] = []
    private(set) var isLoading = false
    private(set) var isSaving = false
    private(set) var isDeleted = false
    var errorMessage: String?

    var isEditing = false
    var editDisplayName = ""
    var editIsActive = true

    private let service: UserServicing
    private let roleService: RoleServicing
    private let groupService: GroupServicing

    init(
        userId: String,
        service: UserServicing = UserService(),
        roleService: RoleServicing = RoleService(),
        groupService: GroupServicing = GroupService()
    ) {
        self.userId = userId
        self.service = service
        self.roleService = roleService
        self.groupService = groupService
    }

    var user: User? { detail?.user }
    var authIdentities: [AuthIdentitySummary] { detail?.authIdentities ?? [] }
    var userRoles: [UserRoleLink] { detail?.userRoles ?? [] }

    var assignableRoles: [Role] {
        let assignedIds = Set(userRoles.map(\.roleId))
        return availableRoles.filter { !assignedIds.contains($0.id) }
    }

    var assignableGroups: [AppGroup] {
        let memberIds = Set(groupMemberships.map(\.groupId))
        return availableGroups.filter { !memberIds.contains($0.id) }
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            detail = try await service.fetchDetail(id: userId)
            groupMemberships = (try? await service.fetchGroups(id: userId)) ?? []
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Person konnte nicht geladen werden."
        }
    }

    func loadAssignablesIfNeeded() async {
        if availableRoles.isEmpty {
            availableRoles = (try? await roleService.fetchAll()) ?? []
        }
        if availableGroups.isEmpty {
            availableGroups = (try? await groupService.fetchAll(page: 1, pageSize: 200).items) ?? []
        }
    }

    func beginEditing() {
        guard let user else { return }
        editDisplayName = user.displayName
        editIsActive = user.isActive
        isEditing = true
    }

    func cancelEditing() {
        isEditing = false
    }

    func saveEdits() async -> Bool {
        guard user != nil else { return false }
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await service.update(id: userId, displayName: editDisplayName, isActive: editIsActive)
            isEditing = false
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Änderungen konnten nicht gespeichert werden."
            return false
        }
    }

    func delete() async {
        do {
            try await service.delete(id: userId)
            isDeleted = true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Person konnte nicht gelöscht werden."
        }
    }

    func resetPassword(newPassword: String) async {
        do {
            try await service.resetPassword(id: userId, newPassword: newPassword)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Passwort konnte nicht zurückgesetzt werden."
        }
    }

    func changeEmail(_ email: String) async {
        do {
            try await service.changeEmail(id: userId, email: email)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "E-Mail-Adresse konnte nicht geändert werden."
        }
    }

    func assignRole(_ roleId: String) async {
        do {
            try await service.assignRole(userId: userId, roleId: roleId)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rolle konnte nicht zugewiesen werden."
        }
    }

    func removeRole(_ roleId: String) async {
        do {
            try await service.removeRole(userId: userId, roleId: roleId)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rolle konnte nicht entfernt werden."
        }
    }

    func addToGroup(_ groupId: String) async {
        do {
            try await service.addToGroup(userId: userId, groupId: groupId)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Person konnte nicht zur Gruppe hinzugefügt werden."
        }
    }

    func removeFromGroup(_ groupId: String) async {
        do {
            try await service.removeFromGroup(userId: userId, groupId: groupId)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Person konnte nicht aus der Gruppe entfernt werden."
        }
    }
}
