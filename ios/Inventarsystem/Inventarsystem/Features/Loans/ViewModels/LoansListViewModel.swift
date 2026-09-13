import Foundation
import Observation

@MainActor
@Observable
final class LoansListViewModel {
    var statusFilter: LoanStatus? {
        didSet { Task { await list.load(page: 1) } }
    }

    private let service: LoanServicing
    var list: OffsetPagedList<Loan>

    init(service: LoanServicing = LoanService()) {
        self.service = service
        list = OffsetPagedList<Loan>(pageSize: 25) { _, _ in
            (items: [], meta: PageMeta(page: 1, pageSize: 25, total: 0, totalPages: 1))
        }
        list = OffsetPagedList<Loan>(pageSize: 25) { [service, weak self] page, pageSize in
            try await service.fetchAll(status: self?.statusFilter, page: page, pageSize: pageSize)
        }
    }

    func onAppear() async {
        await list.load(page: 1)
    }
}
