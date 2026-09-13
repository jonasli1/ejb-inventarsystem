import Foundation
import Observation

@MainActor
@Observable
final class ArticleCreateViewModel {
    var name = ""
    var description = ""
    var notes = ""
    var aliases: [String] = []
    var categoryId: String?
    var unitOfMeasure = ""
    var manufacturer = ""
    private(set) var categories: [Category] = []
    private(set) var isSaving = false
    var errorMessage: String?

    private let articleService: ArticleServicing
    private let categoryService: CategoryServicing

    init(articleService: ArticleServicing = ArticleService(), categoryService: CategoryServicing = CategoryService()) {
        self.articleService = articleService
        self.categoryService = categoryService
    }

    var canSave: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving }

    func loadPickerData() async {
        categories = (try? await categoryService.fetchAll()) ?? []
    }

    func save() async -> Article? {
        guard canSave else { return nil }
        isSaving = true
        defer { isSaving = false }

        let input = ArticleInput(
            name: name,
            description: description,
            notes: notes,
            aliases: aliases.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty },
            categoryId: categoryId,
            unitOfMeasure: unitOfMeasure,
            manufacturer: manufacturer
        )
        do {
            return try await articleService.create(input)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Artikel konnte nicht angelegt werden."
            return nil
        }
    }
}
