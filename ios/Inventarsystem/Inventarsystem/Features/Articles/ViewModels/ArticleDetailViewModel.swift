import Foundation
import Observation

@MainActor
@Observable
final class ArticleDetailViewModel {
    let articleId: String

    private(set) var detail: ArticleListItem?
    private(set) var units: [InventoryItem] = []
    private(set) var documents: [Attachment] = []
    private(set) var photoAttachment: Attachment?
    private(set) var categories: [Category] = []
    private(set) var isLoading = false
    private(set) var isDeleted = false
    var errorMessage: String?

    var isEditing = false
    var editName = ""
    var editDescription = ""
    var editNotes = ""
    var editAliases: [String] = []
    var editCategoryId: String?
    var editUnitOfMeasure = ""
    var editManufacturer = ""
    var editLoanableByQuantity = false
    private(set) var isSaving = false
    private(set) var isUploadingPhoto = false

    private let articleService: ArticleServicing
    private let categoryService: CategoryServicing
    private let attachmentService: AttachmentServicing

    init(
        articleId: String,
        articleService: ArticleServicing = ArticleService(),
        categoryService: CategoryServicing = CategoryService(),
        attachmentService: AttachmentServicing = AttachmentService()
    ) {
        self.articleId = articleId
        self.articleService = articleService
        self.categoryService = categoryService
        self.attachmentService = attachmentService
    }

    var article: Article? { detail?.article }
    var category: Category? { detail?.category }
    var stock: StockSummary? { detail?.stock }

    var canSave: Bool { !editName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            detail = try await articleService.fetchDetail(id: articleId)
            async let unitsResult = try? articleService.fetchUnits(id: articleId)
            async let photoResult = try? attachmentService.list(entityType: .article, entityId: articleId, category: .image)
            async let documentsResult = try? attachmentService.list(entityType: .article, entityId: articleId, category: .document)
            units = await unitsResult ?? []
            photoAttachment = (await photoResult)?.first
            documents = await documentsResult ?? []
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Artikel konnte nicht geladen werden."
        }
    }

    func beginEditing() async {
        guard let article else { return }
        if categories.isEmpty {
            categories = (try? await categoryService.fetchAll()) ?? []
        }
        editName = article.name
        editDescription = article.description ?? ""
        editNotes = article.notes ?? ""
        editAliases = article.aliases
        editCategoryId = article.categoryId
        editUnitOfMeasure = article.unitOfMeasure ?? ""
        editManufacturer = article.manufacturer ?? ""
        editLoanableByQuantity = article.loanableByQuantity
        isEditing = true
    }

    func cancelEditing() {
        isEditing = false
    }

    func saveEdits() async -> Bool {
        guard canSave else { return false }
        isSaving = true
        defer { isSaving = false }

        let input = ArticleInput(
            name: editName,
            description: editDescription,
            notes: editNotes,
            aliases: editAliases.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty },
            categoryId: editCategoryId,
            unitOfMeasure: editUnitOfMeasure,
            manufacturer: editManufacturer,
            loanableByQuantity: editLoanableByQuantity
        )
        do {
            _ = try await articleService.update(id: articleId, input: input)
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
            try await articleService.delete(id: articleId)
            isDeleted = true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Artikel konnte nicht gelöscht werden."
        }
    }

    /// Uploads under the `.image` category — understood by the backend to replace any existing
    /// product photo, so no delete-then-upload dance is needed here (per the task's note on
    /// `AttachmentService`/`.image` semantics, not independently verified against a live
    /// instance).
    func uploadPhoto(fileName: String, mimeType: String, data: Data) async {
        isUploadingPhoto = true
        defer { isUploadingPhoto = false }
        do {
            _ = try await attachmentService.upload(
                entityType: .article, entityId: articleId, category: .image,
                fileName: fileName, mimeType: mimeType, data: data
            )
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Bild konnte nicht hochgeladen werden."
        }
    }

    func uploadDocument(fileName: String, mimeType: String, data: Data) async {
        do {
            _ = try await attachmentService.upload(
                entityType: .article, entityId: articleId, category: .document,
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
