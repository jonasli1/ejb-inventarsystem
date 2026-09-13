import Foundation
import Observation

/// Drives the Personen list. `/users` is offset-paginated only (no cursor/flat mode like
/// Inventar's `/inventory`), so this owns a single `OffsetPagedList` rather than branching
/// between two pagination drivers.
@MainActor
@Observable
final class UsersListViewModel {
    var searchText = "" {
        didSet { scheduleSearch() }
    }

    private let service: UserServicing
    private var searchTask: Task<Void, Never>?

    // See `InventoryListViewModel` for why this starts as a throwaway placeholder closure and
    // is replaced in `init`'s body: `@Observable` is incompatible with `lazy var`, and the real
    // closure needs `self` to already be fully initialized before it can capture it.
    var list = OffsetPagedList<User>(pageSize: 25) { _, pageSize in
        (items: [], meta: PageMeta(page: 1, pageSize: pageSize, total: 0, totalPages: 1))
    }

    init(service: UserServicing = UserService()) {
        self.service = service
        list = OffsetPagedList<User>(pageSize: 25) { [weak self] page, pageSize in
            guard let self else { return (items: [], meta: PageMeta(page: 1, pageSize: pageSize, total: 0, totalPages: 1)) }
            return try await self.service.fetchAll(search: self.searchText.isEmpty ? nil : self.searchText, page: page, pageSize: pageSize)
        }
    }

    func onAppear() async {
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
            await list.load(page: 1)
        }
    }
}
