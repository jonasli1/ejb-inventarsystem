import Foundation
import Observation

@MainActor
@Observable
final class ActivityViewModel {
    var filters = ActivityFilters() {
        didSet { Task { await list.loadInitial() } }
    }
    var loanIdText = "" {
        didSet {
            filters.loanId = loanIdText.isEmpty ? nil : loanIdText
        }
    }

    private let service: ActivityServicing
    var list: CursorPagedList<ActivityEntry>

    init(service: ActivityServicing = ActivityService()) {
        self.service = service
        list = CursorPagedList<ActivityEntry>(pageSize: 50) { _, _ in (items: [], nextCursor: nil) }
        list = CursorPagedList<ActivityEntry>(pageSize: 50) { [service, weak self] cursor, limit in
            try await service.fetch(cursor: cursor, limit: limit, filters: self?.filters ?? ActivityFilters())
        }
    }

    func onAppear() async {
        await list.loadInitial()
    }
}
