import Foundation
import Observation

/// A `Category` plus its already-resolved child nodes. `OutlineGroup`/`List(_:children:)` need an
/// actual nested shape to render a tree; the backend only sends a flat, `parentId`-linked array
/// (see `CategoryService`), so this is resolved client-side once per `load()`. `children == nil`
/// for a leaf (vs. an empty array) so the tree view doesn't show a disclosure triangle with
/// nothing behind it.
nonisolated struct CategoryNode: Identifiable, Sendable {
    let category: Category
    var children: [CategoryNode]?

    var id: String { category.id }
}

/// Drives the Kategorien management sheet — `GET /categories` returns a flat, self-referencing
/// tree (via `parentId`), so this resolves parent/child relationships client-side rather than
/// asking the backend for a nested shape.
@MainActor
@Observable
final class CategoryManagementViewModel {
    private(set) var categories: [Category] = []
    private(set) var isLoading = false
    var errorMessage: String?

    var isPresentingForm = false
    private(set) var editingCategory: Category?
    var formName = ""
    var formParentId: String?
    private(set) var isSaving = false

    private let service: CategoryServicing

    init(service: CategoryServicing = CategoryService()) {
        self.service = service
    }

    /// The top-level nodes of the category tree, each carrying its descendants — feed directly
    /// into `OutlineGroup(_:children:)`/`List(_:children:)`, which handle the recursive rendering
    /// (and indentation/disclosure UI) natively; a hand-written `View`-returning function can't
    /// call itself recursively (an opaque `some View` return type can't refer to itself).
    var rootNodes: [CategoryNode] {
        buildNodes(parentId: nil)
    }

    private func buildNodes(parentId: String?) -> [CategoryNode] {
        childCategories(of: parentId).map { category in
            let childNodes = buildNodes(parentId: category.id)
            return CategoryNode(category: category, children: childNodes.isEmpty ? nil : childNodes)
        }
    }

    private func childCategories(of parentId: String?) -> [Category] {
        categories.filter { $0.parentId == parentId }.sorted { $0.name < $1.name }
    }

    /// Candidate parents for the create/edit form — every category except the one being edited
    /// and any of its descendants, since picking a descendant as the new parent would create a
    /// cycle in the tree.
    var availableParents: [Category] {
        guard let editingCategory else { return categories }
        let excluded = descendantIds(of: editingCategory.id, includingSelf: true)
        return categories.filter { !excluded.contains($0.id) }
    }

    private func descendantIds(of categoryId: String, includingSelf: Bool) -> Set<String> {
        var result: Set<String> = includingSelf ? [categoryId] : []
        for child in childCategories(of: categoryId) {
            result.formUnion(descendantIds(of: child.id, includingSelf: true))
        }
        return result
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            categories = try await service.fetchAll()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Kategorien konnten nicht geladen werden."
        }
    }

    func beginCreating(parentId: String? = nil) {
        editingCategory = nil
        formName = ""
        formParentId = parentId
        isPresentingForm = true
    }

    func beginEditing(_ category: Category) {
        editingCategory = category
        formName = category.name
        formParentId = category.parentId
        isPresentingForm = true
    }

    var canSaveForm: Bool { !formName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving }

    func saveForm() async {
        guard canSaveForm else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            if let editingCategory {
                _ = try await service.update(id: editingCategory.id, name: formName, parentId: formParentId)
            } else {
                _ = try await service.create(name: formName, parentId: formParentId)
            }
            isPresentingForm = false
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Kategorie konnte nicht gespeichert werden."
        }
    }

    func delete(_ category: Category) async {
        do {
            try await service.delete(id: category.id)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Kategorie konnte nicht gelöscht werden."
        }
    }
}
