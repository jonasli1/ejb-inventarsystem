import Foundation
import Observation

/// Drives the Rollen list. `RoleService.fetchAll()` is a plain, unpaginated `GET /roles` (verified
/// against a live instance, see `RoleService`), so unlike `InventoryListViewModel` this has no
/// pagination to manage — just load/refresh plus the mutations the list screen itself performs.
@MainActor
@Observable
final class RolesListViewModel {
    private(set) var roles: [Role] = []
    /// The full ~44-entry permission catalog backing the informational panel — see
    /// `loadPermissionCatalogIfNeeded()`.
    private(set) var allPermissions: [Permission] = []
    private(set) var isLoading = false
    var errorMessage: String?

    private let roleService: RoleServicing
    private let permissionService: PermissionServicing

    init(
        roleService: RoleServicing = RoleService(),
        permissionService: PermissionServicing = PermissionService()
    ) {
        self.roleService = roleService
        self.permissionService = permissionService
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            roles = try await roleService.fetchAll()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rollen konnten nicht geladen werden."
        }
    }

    func refresh() async {
        await load()
    }

    /// Backs the collapsible "Was bedeuten die Berechtigungen?" panel — loaded lazily on first
    /// expansion so fetching the full permission catalog never delays the roles list itself
    /// from appearing, matching the reference frontend's own on-demand `PermissionsInfoCard`.
    func loadPermissionCatalogIfNeeded() async {
        guard allPermissions.isEmpty else { return }
        allPermissions = (try? await permissionService.fetchAll()) ?? []
    }

    /// Used directly by `RolesListView`'s create sheet (there's no separate `RoleCreateViewModel`
    /// — the create form is just a name/description pair, simple enough to live here).
    func create(name: String, description: String) async -> Bool {
        do {
            _ = try await roleService.create(name: name, description: description)
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rolle konnte nicht angelegt werden."
            return false
        }
    }

    /// Not currently wired to any control in `RolesListView` — renaming/re-describing a role
    /// happens through `RoleDetailView`'s own Bearbeiten/Speichern flow (`RoleDetailViewModel`
    /// owns that mutation there). Kept here for API symmetry with `create`/`delete` below.
    func update(id: String, name: String, description: String) async {
        do {
            _ = try await roleService.update(id: id, name: name, description: description)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rolle konnte nicht aktualisiert werden."
        }
    }

    /// Not currently wired to any control in `RolesListView` — deletion happens from
    /// `RoleDetailView`, matching the reference `InventoryDetailView` pattern of keeping
    /// destructive actions on the detail screen rather than an inline list affordance. Kept
    /// here for the same reason as `update` above.
    func delete(id: String) async {
        do {
            try await roleService.delete(id: id)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rolle konnte nicht gelöscht werden."
        }
    }
}
