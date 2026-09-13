import Foundation
import Observation

/// Drives the Inventarobjekte list, including the Einzeln/Gruppiert toggle — `/inventory`'s
/// `grouped` flag switches both response shape and pagination style entirely, so this owns
/// *both* a `CursorPagedList` and an `OffsetPagedList` and picks the active one, rather than
/// forcing one pagination generic to pretend to be the other.
@MainActor
@Observable
final class InventoryListViewModel {
    var isGrouped = false {
        didSet { Task { await reload() } }
    }
    var searchText = "" {
        didSet { scheduleSearch() }
    }
    var statusFilter: InventoryStatus? {
        didSet { Task { await reload() } }
    }

    private let service: InventoryServicing
    private var searchTask: Task<Void, Never>?

    // `@Observable`'s macro transforms stored properties into tracked computed accessors,
    // which is incompatible with both `lazy var` and implicitly-unwrapped optionals (the
    // generated accessor loses the "implicit" part, forcing callers to unwrap). These start
    // with a throwaway placeholder closure (satisfying definite-initialization with no `self`
    // reference needed yet) and are immediately replaced in `init`'s body with the real
    // closures, which capture `self` safely now that every stored property has a value.
    var flatList = CursorPagedList<InventoryItem>(pageSize: 50) { _, _ in (items: [], nextCursor: nil) }
    var groupedList = OffsetPagedList<GroupedInventoryEntry>(pageSize: 20) { _, pageSize in
        (items: [], meta: PageMeta(page: 1, pageSize: pageSize, total: 0, totalPages: 1))
    }

    init(service: InventoryServicing = InventoryService()) {
        self.service = service
        flatList = CursorPagedList<InventoryItem>(pageSize: 50) { [weak self] cursor, limit in
            guard let self else { return (items: [], nextCursor: nil) }
            return try await self.service.fetchFlat(cursor: cursor, limit: limit, filters: self.currentFilters())
        }
        groupedList = OffsetPagedList<GroupedInventoryEntry>(pageSize: 20) { [weak self] page, pageSize in
            guard let self else { return (items: [], meta: PageMeta(page: 1, pageSize: pageSize, total: 0, totalPages: 1)) }
            return try await self.service.fetchGrouped(page: page, pageSize: pageSize, filters: self.currentFilters())
        }
    }

    func onAppear() async {
        await reload()
    }

    func reload() async {
        if isGrouped {
            await groupedList.load(page: 1)
        } else {
            await flatList.loadInitial()
        }
    }

    func refresh() async {
        if isGrouped {
            await groupedList.refresh()
        } else {
            await flatList.refresh()
        }
    }

    /// Called from the scanned-inventory-number confirmation — writes straight into the search
    /// field and triggers the search immediately (no debounce wait), matching the task's
    /// "recognized number is written into search and the search is triggered" requirement.
    func applyScannedNumber(_ number: String) {
        searchTask?.cancel()
        searchText = number
        Task { await reload() }
    }

    private func currentFilters() -> InventoryFilters {
        InventoryFilters(status: statusFilter, search: searchText.isEmpty ? nil : searchText)
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
