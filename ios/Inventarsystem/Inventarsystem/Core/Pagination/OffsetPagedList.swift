import Foundation
import Observation

/// Generic driver for classic offset-paginated endpoints (`{data, meta:{page,pageSize,total,
/// totalPages}}` — grouped inventory, articles, organizations, users, loans, ...).
@MainActor
@Observable
final class OffsetPagedList<Item: Sendable> {
    private(set) var items: [Item] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var page = 1
    private(set) var totalPages = 1
    private(set) var total = 0

    private let pageSize: Int
    private let fetchPage: (_ page: Int, _ pageSize: Int) async throws -> (items: [Item], meta: PageMeta)

    init(
        pageSize: Int = 25,
        fetchPage: @escaping (_ page: Int, _ pageSize: Int) async throws -> (items: [Item], meta: PageMeta)
    ) {
        self.pageSize = pageSize
        self.fetchPage = fetchPage
    }

    var hasNextPage: Bool { page < totalPages }
    var hasPreviousPage: Bool { page > 1 }

    func load(page: Int = 1) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let result = try await fetchPage(page, pageSize)
            items = result.items
            self.page = result.meta.page
            totalPages = max(result.meta.totalPages, 1)
            total = result.meta.total
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Die Liste konnte nicht geladen werden."
        }
    }

    func loadNextPage() async { if hasNextPage { await load(page: page + 1) } }
    func loadPreviousPage() async { if hasPreviousPage { await load(page: page - 1) } }
    func refresh() async { await load(page: page) }
}
