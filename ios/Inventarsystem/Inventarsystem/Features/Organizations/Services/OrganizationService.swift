import Foundation

nonisolated protocol OrganizationServicing: Sendable {
    func fetchAll() async throws -> [Organization]
    func create(name: String) async throws -> Organization
    func update(id: String, name: String) async throws -> Organization
    func delete(id: String) async throws
    func createUnit(organizationId: String, name: String) async throws -> OrganizationUnit
    func updateUnit(organizationId: String, unitId: String, name: String) async throws -> OrganizationUnit
    func deleteUnit(organizationId: String, unitId: String) async throws
}

nonisolated struct OrganizationService: OrganizationServicing {
    private struct NameBody: Encodable { let name: String }

    /// `GET /organizations` is offset-paginated (verified against a live instance), unlike
    /// `/locations`. Organizations are a genuinely small, admin-managed vocabulary in practice
    /// (the two-tier owner model), so a single large page stands in for "all" here rather than
    /// building a second paging UI just for this picker's sake.
    func fetchAll() async throws -> [Organization] {
        let result: OffsetPage<Organization> = try await APIClient.shared.request(
            "organizations", query: [URLQueryItem(name: "pageSize", value: "200")]
        )
        return result.data
    }

    func create(name: String) async throws -> Organization {
        try await APIClient.shared.request("organizations", method: "POST", body: NameBody(name: name))
    }

    func update(id: String, name: String) async throws -> Organization {
        try await APIClient.shared.request("organizations/\(id)", method: "PUT", body: NameBody(name: name))
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("organizations/\(id)", method: "DELETE")
    }

    func createUnit(organizationId: String, name: String) async throws -> OrganizationUnit {
        try await APIClient.shared.request("organizations/\(organizationId)/units", method: "POST", body: NameBody(name: name))
    }

    /// Confirmed against a live instance: unlike a flat `/organization-units/:id`, which 404s,
    /// updating a unit is nested under its organization, matching create/delete.
    func updateUnit(organizationId: String, unitId: String, name: String) async throws -> OrganizationUnit {
        try await APIClient.shared.request("organizations/\(organizationId)/units/\(unitId)", method: "PUT", body: NameBody(name: name))
    }

    func deleteUnit(organizationId: String, unitId: String) async throws {
        try await APIClient.shared.requestVoid("organizations/\(organizationId)/units/\(unitId)", method: "DELETE")
    }
}
