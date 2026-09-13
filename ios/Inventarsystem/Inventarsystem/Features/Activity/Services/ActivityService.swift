import Foundation

nonisolated struct ActivityFilters: Sendable, Equatable {
    var articleId: String?
    var userId: String?
    /// Raw `StockMovementType` rawValue (e.g. "move", "status_change") — only meaningful for
    /// movement-sourced entries, but the backend accepts it as a plain filter regardless.
    var movementType: String?
    var loanId: String?
    var sortAscending = false

    fileprivate func queryItems() -> [URLQueryItem] {
        var items: [URLQueryItem] = []
        if let articleId { items.append(.init(name: "articleId", value: articleId)) }
        if let userId { items.append(.init(name: "userId", value: userId)) }
        if let movementType { items.append(.init(name: "type", value: movementType)) }
        if let loanId, !loanId.isEmpty { items.append(.init(name: "loanId", value: loanId)) }
        // Verified against a live instance: the sort query param is `sortOrder`, not `sort`.
        items.append(.init(name: "sortOrder", value: sortAscending ? "asc" : "desc"))
        return items
    }
}

nonisolated protocol ActivityServicing: Sendable {
    func fetch(cursor: String?, limit: Int, filters: ActivityFilters) async throws -> (items: [ActivityEntry], nextCursor: String?)
}

nonisolated struct ActivityService: ActivityServicing {
    func fetch(cursor: String?, limit: Int, filters: ActivityFilters) async throws -> (items: [ActivityEntry], nextCursor: String?) {
        var query = filters.queryItems()
        query.append(URLQueryItem(name: "limit", value: String(limit)))
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        let page: CursorPage<ActivityEntry> = try await APIClient.shared.request("activity", query: query)
        return (page.data, page.nextCursor)
    }
}
