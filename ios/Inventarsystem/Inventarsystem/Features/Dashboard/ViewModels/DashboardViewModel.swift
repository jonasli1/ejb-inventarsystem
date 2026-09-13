import Foundation
import Observation

@MainActor
@Observable
final class DashboardViewModel {
    enum Destination {
        case inventory, articles, loans, organizations
    }

    struct StatTile: Identifiable {
        let id: Destination
        let label: String
        var value: Int?
        let systemImage: String
    }

    private(set) var tiles: [StatTile] = []
    private(set) var isLoading = true

    private let session: AuthSession
    private let inventoryService: InventoryServicing

    init(session: AuthSession = .shared, inventoryService: InventoryServicing = InventoryService()) {
        self.session = session
        self.inventoryService = inventoryService
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        var tiles: [StatTile] = []
        if session.hasPermission("inventory.read") {
            let count = try? await inventoryService.count()
            tiles.append(StatTile(id: .inventory, label: "Inventar", value: count, systemImage: "shippingbox"))
        }
        if session.hasPermission("articles.read") {
            let count = try? await Self.total(path: "articles")
            tiles.append(StatTile(id: .articles, label: "Artikel im Katalog", value: count, systemImage: "tag"))
        }
        if session.hasAnyPermission(["loans.manage", "loans.spend", "loans.administer"]) {
            let count = try? await Self.openLoansTotal()
            tiles.append(StatTile(id: .loans, label: "Offene Ausleihen", value: count, systemImage: "arrow.left.arrow.right"))
        }
        if session.hasPermission("organizations.read") {
            let count = try? await Self.total(path: "organizations")
            tiles.append(StatTile(id: .organizations, label: "Organisationen", value: count, systemImage: "building.2"))
        }
        self.tiles = tiles
    }

    /// Mirrors the frontend's generic `useCount` helper: any offset-paginated list endpoint's
    /// `meta.total` at `pageSize=1`, without decoding the (feature-specific) row shape.
    private static func total(path: String, extraQuery: [URLQueryItem] = []) async throws -> Int {
        let page: OffsetPage<JSONValue> = try await APIClient.shared.request(path, query: [URLQueryItem(name: "pageSize", value: "1")] + extraQuery)
        return page.meta.total
    }

    private static func openLoansTotal() async throws -> Int {
        var sum = 0
        for status in [LoanStatus.requested, .approved, .issued] {
            sum += try await total(path: "loans", extraQuery: [URLQueryItem(name: "status", value: status.rawValue)])
        }
        return sum
    }
}
