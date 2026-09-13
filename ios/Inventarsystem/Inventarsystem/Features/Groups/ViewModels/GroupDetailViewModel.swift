import Foundation
import Observation

/// Drives the Gruppe detail screen: the group's own identity (editable only for a manually
/// created group — a ChurchTools-synced one has its name/description managed by the sync
/// process, not by hand here), its assigned Rollen, and its Organisations-Zuordnung (the
/// Organisation/Unit scopes that determine which Ausleihen its members with loan-management
/// roles may act on). The scoping itself matters for the UI, but the actual loan-authorization
/// logic is entirely server-side — this view model only displays/edits the scope list.
@MainActor
@Observable
final class GroupDetailViewModel {
    private(set) var group: AppGroup
    private(set) var roles: [Role] = []
    private(set) var organizationScopes: [GroupOrganizationScope] = []
    /// Full roster, for the "Rolle hinzufügen" picker.
    private(set) var allRoles: [Role] = []
    /// Full roster (each with its `units` embedded), for the "Organisation zuordnen" picker.
    private(set) var allOrganizations: [Organization] = []
    private(set) var isLoading = false
    private(set) var isSaving = false
    private(set) var isDeleted = false
    var errorMessage: String?

    var isEditing = false
    var editName = ""
    var editDescription = ""

    private let service: GroupServicing
    private let roleService: RoleServicing
    private let organizationService: OrganizationServicing

    init(
        group: AppGroup,
        service: GroupServicing = GroupService(),
        roleService: RoleServicing = RoleService(),
        organizationService: OrganizationServicing = OrganizationService()
    ) {
        self.group = group
        self.service = service
        self.roleService = roleService
        self.organizationService = organizationService
    }

    /// Roles not yet assigned to this group — the candidate list shown in the "Rolle
    /// hinzufügen" picker.
    var assignableRoles: [Role] {
        let assignedIds = Set(roles.map(\.id))
        return allRoles.filter { !assignedIds.contains($0.id) }
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        // Picker-supporting data: falls back to an empty list on failure rather than blocking
        // the rest of the screen, matching `InventoryCreateViewModel.loadPickerData()`.
        async let allRolesResult = try? roleService.fetchAll()
        async let allOrgsResult = try? organizationService.fetchAll()
        allRoles = await allRolesResult ?? []
        allOrganizations = await allOrgsResult ?? []

        do {
            async let rolesResult = service.fetchRoles(groupId: group.id)
            async let scopesResult = service.fetchOrganizationScopes(groupId: group.id)
            roles = try await rolesResult
            organizationScopes = try await scopesResult
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Gruppendaten konnten nicht geladen werden."
        }
    }

    // MARK: - Identität (nur für manuell angelegte Gruppen)

    func beginEditing() {
        editName = group.name
        editDescription = group.description ?? ""
        isEditing = true
    }

    func cancelEditing() {
        isEditing = false
    }

    func saveEdits() async -> Bool {
        isSaving = true
        defer { isSaving = false }
        let trimmedName = editName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedDescription = editDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            group = try await service.update(id: group.id, name: trimmedName, description: trimmedDescription)
            isEditing = false
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Gruppe konnte nicht gespeichert werden."
            return false
        }
    }

    func delete() async {
        do {
            try await service.delete(id: group.id)
            isDeleted = true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Gruppe konnte nicht gelöscht werden."
        }
    }

    // MARK: - Rollen

    func assignRole(_ roleId: String) async {
        do {
            try await service.assignRole(groupId: group.id, roleId: roleId)
            roles = try await service.fetchRoles(groupId: group.id)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rolle konnte nicht zugewiesen werden."
        }
    }

    func removeRole(_ roleId: String) async {
        do {
            try await service.removeRole(groupId: group.id, roleId: roleId)
            roles = try await service.fetchRoles(groupId: group.id)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rolle konnte nicht entfernt werden."
        }
    }

    // MARK: - Organisations-Zuordnung

    func addOrganizationScope(organizationId: String, organizationUnitId: String?) async {
        do {
            try await service.addOrganizationScope(groupId: group.id, organizationId: organizationId, organizationUnitId: organizationUnitId)
            organizationScopes = try await service.fetchOrganizationScopes(groupId: group.id)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Organisation konnte nicht zugeordnet werden."
        }
    }

    func removeOrganizationScope(_ scopeId: String) async {
        do {
            try await service.removeOrganizationScope(groupId: group.id, scopeId: scopeId)
            organizationScopes = try await service.fetchOrganizationScopes(groupId: group.id)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Organisations-Zuordnung konnte nicht entfernt werden."
        }
    }
}
