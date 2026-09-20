import Foundation
import Observation

@MainActor
@Observable
final class InventoryDetailViewModel {
    let itemId: String

    private(set) var detail: InventoryItemDetail?
    private(set) var movements: [StockMovement] = []
    private(set) var documents: [Attachment] = []
    private(set) var inspectionDocuments: [Attachment] = []
    private(set) var isLoading = false
    private(set) var isDeleted = false
    var errorMessage: String?

    var isEditing = false
    var editOwnerOrganizationId = ""
    var editOwnerUnitId = ""
    var editInventoryNumber = ""
    var editSerialNumber = ""
    var editNotes = ""
    var editPurchasePriceText = ""
    var editPurchaseDate: Date?
    var editNextDguvV3Check: Date?
    var editStatus: InventoryStatus = .available
    private(set) var organizations: [Organization] = []
    private(set) var isSaving = false

    private let service: InventoryServicing
    private let attachmentService: AttachmentServicing
    private let organizationService: OrganizationServicing

    init(
        itemId: String,
        service: InventoryServicing = InventoryService(),
        attachmentService: AttachmentServicing = AttachmentService(),
        organizationService: OrganizationServicing = OrganizationService()
    ) {
        self.itemId = itemId
        self.service = service
        self.attachmentService = attachmentService
        self.organizationService = organizationService
    }

    var item: InventoryItem? { detail?.item }
    var accessories: [InventoryItem] { detail?.accessories ?? [] }

    var editAvailableUnits: [OrganizationUnit] {
        organizations.first(where: { $0.id == editOwnerOrganizationId })?.units ?? []
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            detail = try await service.fetchDetail(id: itemId)
            async let docs = try? attachmentService.list(entityType: .inventoryItem, entityId: itemId, category: .document)
            async let inspections = try? attachmentService.list(entityType: .inventoryItem, entityId: itemId, category: .inspection)
            documents = await docs ?? []
            inspectionDocuments = await inspections ?? []
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Objekt konnte nicht geladen werden."
        }
    }

    func loadMovementsIfNeeded() async {
        guard movements.isEmpty, let id = item?.id else { return }
        movements = (try? await service.fetchMovements(id: id)) ?? []
    }

    func beginEditing() async {
        guard let item else { return }
        if organizations.isEmpty {
            organizations = (try? await organizationService.fetchAll()) ?? []
        }
        editOwnerOrganizationId = item.ownerOrganizationId
        editOwnerUnitId = item.ownerUnitId
        editInventoryNumber = item.inventoryNumber ?? ""
        editSerialNumber = item.serialNumber ?? ""
        editNotes = item.notes ?? ""
        editPurchasePriceText = item.purchasePrice.map { NSDecimalNumber(decimal: $0).stringValue } ?? ""
        editPurchaseDate = item.purchaseDate
        editNextDguvV3Check = item.nextDguvV3Check
        editStatus = item.status
        isEditing = true
    }

    func cancelEditing() {
        isEditing = false
    }

    /// `canChangeInventoryNumber` must reflect the current user's real permission — the backend
    /// 403s if `inventoryNumber` is present in the body at all when they lack
    /// `inventory.change_inventory_number`, even when resending the unchanged value (verified
    /// against a live instance), so the field is omitted entirely rather than "sent unchanged".
    /// `status` is kept to the same conservative rule (only sent when actually changing it) even
    /// though the backend's retire-permission check may well be transition-specific rather than
    /// presence-based — not re-verified separately, so treated the same way to be safe.
    func saveEdits(canChangeInventoryNumber: Bool) async -> Bool {
        guard let item else { return false }
        isSaving = true
        defer { isSaving = false }

        let normalizedPrice = editPurchasePriceText.replacingOccurrences(of: ",", with: ".")
        var input = UpdateInventoryItemInput(
            ownerOrganizationId: editOwnerOrganizationId,
            ownerUnitId: editOwnerUnitId,
            serialNumber: editSerialNumber,
            notes: editNotes,
            purchasePrice: normalizedPrice.isEmpty ? nil : Decimal(string: normalizedPrice),
            purchaseDate: editPurchaseDate,
            nextDguvV3Check: editNextDguvV3Check
        )
        if canChangeInventoryNumber, editInventoryNumber != (item.inventoryNumber ?? "") {
            input.inventoryNumber = editInventoryNumber
        }
        if editStatus != item.status {
            input.status = editStatus
        }

        do {
            _ = try await service.update(id: item.id, input: input)
            isEditing = false
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Änderungen konnten nicht gespeichert werden."
            return false
        }
    }

    /// "Direkt ausmustern" from the maintenance-status alert — a bare status change, no reason
    /// collected, matching the reference frontend exactly.
    func decommission() async {
        guard let item else { return }
        do {
            _ = try await service.update(id: item.id, input: UpdateInventoryItemInput(
                ownerOrganizationId: item.ownerOrganizationId,
                ownerUnitId: item.ownerUnitId,
                status: .retired
            ))
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Objekt konnte nicht ausgemustert werden."
        }
    }

    func delete() async {
        guard let item else { return }
        do {
            try await service.delete(id: item.id)
            isDeleted = true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Objekt konnte nicht gelöscht werden."
        }
    }

    func accessoryCandidateSearch(_ query: String) async -> [AccessoryCandidate] {
        guard let id = item?.id else { return [] }
        return (try? await service.fetchAccessoryCandidates(itemId: id, search: query, page: 1, pageSize: 20).items) ?? []
    }

    func assignAccessory(_ accessoryItemId: String, separatelyLoanable: Bool) async {
        guard let id = item?.id else { return }
        do {
            try await service.assignAccessory(itemId: id, accessoryItemId: accessoryItemId, separatelyLoanable: separatelyLoanable)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Zubehör konnte nicht zugeordnet werden."
        }
    }

    func removeAccessory(_ accessoryId: String) async {
        guard let id = item?.id else { return }
        do {
            try await service.removeAccessory(itemId: id, accessoryId: accessoryId)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Zubehör konnte nicht entfernt werden."
        }
    }

    func setAccessorySeparatelyLoanable(_ accessoryId: String, separatelyLoanable: Bool) async {
        do {
            try await service.setSeparatelyLoanable(itemId: accessoryId, separatelyLoanable: separatelyLoanable)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Änderung konnte nicht gespeichert werden."
        }
    }

    func uploadDocument(category: AttachmentCategory, fileName: String, mimeType: String, data: Data) async {
        do {
            _ = try await attachmentService.upload(
                entityType: .inventoryItem, entityId: itemId, category: category,
                fileName: fileName, mimeType: mimeType, data: data
            )
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Datei konnte nicht hochgeladen werden."
        }
    }

    func deleteAttachment(_ id: String) async {
        do {
            try await attachmentService.delete(id: id)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Datei konnte nicht gelöscht werden."
        }
    }
}
