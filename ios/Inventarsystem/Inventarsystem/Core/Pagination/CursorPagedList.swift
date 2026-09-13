import Foundation
import Observation

/// Generic driver for cursor/keyset-paginated endpoints (`{data, nextCursor}` — the flat
/// inventory list, audit log, and activity feed). Feature ViewModels own one of these per list
/// instead of reimplementing "load more" bookkeeping each time.
@MainActor
@Observable
final class CursorPagedList<Item: Sendable> {
    private(set) var items: [Item] = []
    private(set) var isLoadingInitial = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var hasMore = true

    private var nextCursor: String?
    private let pageSize: Int
    private let fetchPage: (_ cursor: String?, _ limit: Int) async throws -> (items: [Item], nextCursor: String?)

    init(
        pageSize: Int = 50,
        fetchPage: @escaping (_ cursor: String?, _ limit: Int) async throws -> (items: [Item], nextCursor: String?)
    ) {
        self.pageSize = pageSize
        self.fetchPage = fetchPage
    }

    func loadInitial() async {
        isLoadingInitial = true
        errorMessage = nil
        defer { isLoadingInitial = false }
        do {
            let page = try await fetchPage(nil, pageSize)
            items = page.items
            nextCursor = page.nextCursor
            hasMore = page.nextCursor != nil
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Die Liste konnte nicht geladen werden."
        }
    }

    /// Call from a row's `.task`/`onAppear` — triggers the next page a few rows before the end,
    /// matching common infinite-scroll UX, without a separate "Weiter" button.
    func loadMoreIfNeeded(currentItem item: Item) where Item: Identifiable {
        guard hasMore, !isLoadingMore, !isLoadingInitial else { return }
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        if index >= items.count - 10 {
            Task { await loadMore() }
        }
    }

    func loadMore() async {
        guard hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await fetchPage(nextCursor, pageSize)
            items.append(contentsOf: page.items)
            nextCursor = page.nextCursor
            hasMore = page.nextCursor != nil
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Weitere Einträge konnten nicht geladen werden."
        }
    }

    func refresh() async { await loadInitial() }
}
