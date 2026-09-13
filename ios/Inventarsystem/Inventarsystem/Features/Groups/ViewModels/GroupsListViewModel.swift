import Foundation
import Observation

/// Drives the Gruppen list. Groups are either synced automatically from ChurchTools on login
/// (`externalRef` non-nil) or created manually by an admin — both kinds are shown together here,
/// distinguished in the row/detail UI by a source tag, not by separate lists.
@MainActor
@Observable
final class GroupsListViewModel {
    /// Surfaced only by `createGroup` — claimed into a local `errorMessage` by the create sheet
    /// (see `GroupCreateSheet.save()`), so it never lingers here to be shown a second time.
    var errorMessage: String?

    // `@Observable`'s macro transforms stored properties into tracked computed accessors, which
    // is incompatible with `lazy var`. This starts with a throwaway placeholder closure
    // (satisfying definite-initialization with no `self` reference needed yet) and is
    // immediately replaced in `init`'s body with the real, self-capturing closure — exactly like
    // `InventoryListViewModel.flatList`/`groupedList`.
    var groups = OffsetPagedList<AppGroup>(pageSize: 25) { _, pageSize in
        (items: [], meta: PageMeta(page: 1, pageSize: pageSize, total: 0, totalPages: 1))
    }

    private let service: GroupServicing

    init(service: GroupServicing = GroupService()) {
        self.service = service
        groups = OffsetPagedList<AppGroup>(pageSize: 25) { [weak self] page, pageSize in
            guard let self else { return (items: [], meta: PageMeta(page: 1, pageSize: pageSize, total: 0, totalPages: 1)) }
            return try await self.service.fetchAll(page: page, pageSize: pageSize)
        }
    }

    func onAppear() async {
        await groups.load()
    }

    func refresh() async {
        await groups.refresh()
    }

    /// Creates a manually-managed Gruppe and reloads the first page so it appears immediately.
    /// ChurchTools-synced groups are never created this way — the create sheet that calls this
    /// is only ever shown for the manual case.
    func createGroup(name: String, description: String) async -> Bool {
        do {
            _ = try await service.create(name: name, description: description)
            await groups.load(page: 1)
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Gruppe konnte nicht angelegt werden."
            return false
        }
    }
}
