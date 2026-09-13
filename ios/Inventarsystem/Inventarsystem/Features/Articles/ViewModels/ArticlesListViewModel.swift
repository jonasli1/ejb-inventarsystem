import Foundation
import Observation

/// Drives the Artikel catalog list (`/articles`) — unlike Inventarobjekte, Artikel don't need a
/// flat/grouped toggle, just a single offset-paginated list, a debounced search field, and an
/// optional category filter. Also owns the category vocabulary used by the filter `Picker`.
@MainActor
@Observable
final class ArticlesListViewModel {
    var searchText = "" {
        didSet { scheduleSearch() }
    }
    var categoryId: String? {
        didSet { Task { await reload() } }
    }

    private(set) var categories: [Category] = []

    private let articleService: ArticleServicing
    private let categoryService: CategoryServicing
    private var searchTask: Task<Void, Never>?

    // `@Observable`'s macro transforms stored properties into tracked computed accessors, which
    // is incompatible with `lazy var` (see `InventoryListViewModel`). This starts with a
    // throwaway placeholder closure (satisfying definite-initialization with no `self` reference
    // needed yet) and is immediately replaced in `init`'s body with the real, self-capturing
    // closure, once every other stored property has a value.
    var list = OffsetPagedList<ArticleListItem>(pageSize: 20) { _, pageSize in
        (items: [], meta: PageMeta(page: 1, pageSize: pageSize, total: 0, totalPages: 1))
    }

    init(articleService: ArticleServicing = ArticleService(), categoryService: CategoryServicing = CategoryService()) {
        self.articleService = articleService
        self.categoryService = categoryService
        list = OffsetPagedList<ArticleListItem>(pageSize: 20) { [weak self] page, pageSize in
            guard let self else { return (items: [], meta: PageMeta(page: 1, pageSize: pageSize, total: 0, totalPages: 1)) }
            return try await self.articleService.search(query: self.searchText, categoryId: self.categoryId, page: page, pageSize: pageSize)
        }
    }

    func onAppear() async {
        async let categoriesResult = try? categoryService.fetchAll()
        await reload()
        categories = await categoriesResult ?? []
    }

    func reload() async {
        await list.load(page: 1)
    }

    func refresh() async {
        await list.refresh()
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            await reload()
        }
    }
}
