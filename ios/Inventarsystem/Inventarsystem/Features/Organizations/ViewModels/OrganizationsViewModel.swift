import Foundation
import Observation

/// Drives both the Organisationen list and the Untereinheiten list nested under it. The
/// "two-tier owner" vocabulary is small and admin-managed (see `OrganizationService.fetchAll`),
/// so a single in-memory list — each `Organization` with its `units` embedded — backs both
/// screens instead of two separate loaders: `OrganizationUnitsListView` simply reads `units`
/// off the matching `Organization` here, so an edit/delete made on either screen is immediately
/// reflected on both after the shared reload.
@MainActor
@Observable
final class OrganizationsViewModel {
    private(set) var organizations: [Organization] = []
    private(set) var isLoading = false
    var errorMessage: String?

    private let service: OrganizationServicing

    init(service: OrganizationServicing = OrganizationService()) {
        self.service = service
    }

    func organization(id: String) -> Organization? {
        organizations.first(where: { $0.id == id })
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            organizations = try await service.fetchAll()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Organisationen konnten nicht geladen werden."
        }
    }

    func createOrganization(name: String) async -> Bool {
        do {
            _ = try await service.create(name: name)
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Organisation konnte nicht angelegt werden."
            return false
        }
    }

    func updateOrganization(id: String, name: String) async -> Bool {
        do {
            _ = try await service.update(id: id, name: name)
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Organisation konnte nicht gespeichert werden."
            return false
        }
    }

    func deleteOrganization(id: String) async {
        do {
            try await service.delete(id: id)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Organisation konnte nicht gelöscht werden."
        }
    }

    func createUnit(organizationId: String, name: String) async -> Bool {
        do {
            _ = try await service.createUnit(organizationId: organizationId, name: name)
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Untereinheit konnte nicht angelegt werden."
            return false
        }
    }

    func updateUnit(organizationId: String, unitId: String, name: String) async -> Bool {
        do {
            _ = try await service.updateUnit(organizationId: organizationId, unitId: unitId, name: name)
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Untereinheit konnte nicht gespeichert werden."
            return false
        }
    }

    func deleteUnit(organizationId: String, unitId: String) async {
        do {
            try await service.deleteUnit(organizationId: organizationId, unitId: unitId)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Untereinheit konnte nicht gelöscht werden."
        }
    }

    /// Reads and clears the current error in one step. Used by the create/edit sheet (see
    /// `OrganizationNameFormSheet`), which must show its own failure locally — while it's
    /// presented, it is the topmost screen, not the list underneath it — rather than relying on
    /// the list screen's `.errorAlert`. Clearing here prevents the same message from resurfacing
    /// unexpectedly on the list once the sheet is dismissed.
    func consumeErrorMessage() -> String? {
        defer { errorMessage = nil }
        return errorMessage
    }
}
