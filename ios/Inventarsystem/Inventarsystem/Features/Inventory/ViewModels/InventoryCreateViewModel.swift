import Foundation
import Observation

@MainActor
@Observable
final class InventoryCreateViewModel {
    var selectedArticle: ArticleListItem?
    private(set) var locations: [Location] = []
    private(set) var organizations: [Organization] = []
    var selectedLocationId: String?
    var selectedRoomId: String?
    var selectedOrganizationId: String?
    var selectedUnitId: String?
    var inventoryNumber = ""
    var serialNumber = ""
    var notes = ""
    var purchasePriceText = ""
    var purchaseDate: Date?
    var nextDguvV3Check: Date?
    private(set) var isSaving = false
    var errorMessage: String?

    private let inventoryService: InventoryServicing
    private let articleService: ArticleServicing
    private let locationService: LocationServicing
    private let organizationService: OrganizationServicing

    init(
        inventoryService: InventoryServicing = InventoryService(),
        articleService: ArticleServicing = ArticleService(),
        locationService: LocationServicing = LocationService(),
        organizationService: OrganizationServicing = OrganizationService()
    ) {
        self.inventoryService = inventoryService
        self.articleService = articleService
        self.locationService = locationService
        self.organizationService = organizationService
    }

    var availableRooms: [Room] {
        locations.first(where: { $0.id == selectedLocationId })?.rooms ?? []
    }

    var availableUnits: [OrganizationUnit] {
        organizations.first(where: { $0.id == selectedOrganizationId })?.units ?? []
    }

    var canSave: Bool {
        selectedArticle != nil
            && selectedLocationId != nil
            && selectedRoomId != nil
            && selectedOrganizationId != nil
            && selectedUnitId != nil
            && !isSaving
    }

    func loadPickerData() async {
        async let locationsResult = try? locationService.fetchAll()
        async let organizationsResult = try? organizationService.fetchAll()
        locations = await locationsResult ?? []
        organizations = await organizationsResult ?? []
    }

    func articleSearch(_ query: String) async -> [ArticleListItem] {
        (try? await articleService.search(query: query, categoryId: nil, page: 1, pageSize: 20).items) ?? []
    }

    func selectLocation(_ id: String) {
        selectedLocationId = id
        selectedRoomId = nil
    }

    func selectOrganization(_ id: String) {
        selectedOrganizationId = id
        selectedUnitId = nil
    }

    func save() async -> InventoryItem? {
        guard let article = selectedArticle,
              let locationId = selectedLocationId,
              let roomId = selectedRoomId,
              let orgId = selectedOrganizationId,
              let unitId = selectedUnitId
        else { return nil }

        isSaving = true
        defer { isSaving = false }

        let normalizedPrice = purchasePriceText.replacingOccurrences(of: ",", with: ".")
        let input = CreateInventoryItemInput(
            articleId: article.id,
            locationId: locationId,
            roomId: roomId,
            ownerOrganizationId: orgId,
            ownerUnitId: unitId,
            inventoryNumber: inventoryNumber,
            serialNumber: serialNumber,
            notes: notes,
            purchasePrice: Decimal(string: normalizedPrice),
            purchaseDate: purchaseDate,
            nextDguvV3Check: nextDguvV3Check
        )
        do {
            return try await inventoryService.create(input)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Objekt konnte nicht angelegt werden."
            return nil
        }
    }
}
