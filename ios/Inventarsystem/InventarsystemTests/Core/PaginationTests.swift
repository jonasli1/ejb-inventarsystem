import Testing
import Foundation
@testable import Inventarsystem

private struct Fake: Identifiable, Sendable, Equatable {
    let id: Int
}

@MainActor
struct CursorPagedListTests {
    @Test func loadsInitialPageAndTracksHasMore() async {
        let list = CursorPagedList<Fake>(pageSize: 2) { cursor, limit in
            #expect(cursor == nil)
            #expect(limit == 2)
            return (items: [Fake(id: 1), Fake(id: 2)], nextCursor: "cursor-2")
        }
        await list.loadInitial()
        #expect(list.items.map(\.id) == [1, 2])
        #expect(list.hasMore)
        #expect(list.errorMessage == nil)
    }

    @Test func appendsSubsequentPagesAndStopsWhenNextCursorIsNil() async {
        var callCount = 0
        let list = CursorPagedList<Fake>(pageSize: 2) { cursor, _ in
            callCount += 1
            switch cursor {
            case nil:
                return (items: [Fake(id: 1), Fake(id: 2)], nextCursor: "c2")
            case "c2":
                return (items: [Fake(id: 3)], nextCursor: nil)
            default:
                Issue.record("Unexpected cursor: \(String(describing: cursor))")
                return (items: [], nextCursor: nil)
            }
        }

        await list.loadInitial()
        #expect(list.items.map(\.id) == [1, 2])
        #expect(list.hasMore)

        await list.loadMore()
        #expect(list.items.map(\.id) == [1, 2, 3])
        #expect(!list.hasMore)
        #expect(callCount == 2)

        // Calling loadMore again once hasMore is false must not fire another request.
        await list.loadMore()
        #expect(callCount == 2)
    }

    @Test func refreshReplacesItemsRatherThanAppending() async {
        var generation = 0
        let list = CursorPagedList<Fake>(pageSize: 10) { _, _ in
            generation += 1
            return (items: [Fake(id: generation)], nextCursor: nil)
        }
        await list.loadInitial()
        #expect(list.items.map(\.id) == [1])
        await list.refresh()
        #expect(list.items.map(\.id) == [2], "refresh should replace, not append")
    }

    @Test func surfacesAGermanErrorMessageOnFailure() async {
        struct Boom: LocalizedError {
            var errorDescription: String? { "Verbindung fehlgeschlagen." }
        }
        let list = CursorPagedList<Fake>(pageSize: 10) { _, _ in throw Boom() }
        await list.loadInitial()
        #expect(list.items.isEmpty)
        #expect(list.errorMessage == "Verbindung fehlgeschlagen.")
    }
}

@MainActor
struct OffsetPagedListTests {
    @Test func loadsRequestedPageAndExposesMeta() async {
        let list = OffsetPagedList<Fake>(pageSize: 25) { page, pageSize in
            #expect(pageSize == 25)
            return (
                items: [Fake(id: page)],
                meta: PageMeta(page: page, pageSize: pageSize, total: 3, totalPages: 3)
            )
        }
        await list.load(page: 2)
        #expect(list.items.map(\.id) == [2])
        #expect(list.page == 2)
        #expect(list.totalPages == 3)
        #expect(list.hasNextPage)
        #expect(list.hasPreviousPage)
    }

    @Test func nextAndPreviousPageRespectBounds() async {
        let list = OffsetPagedList<Fake>(pageSize: 10) { page, pageSize in
            (items: [Fake(id: page)], meta: PageMeta(page: page, pageSize: pageSize, total: 20, totalPages: 2))
        }
        await list.load(page: 1)
        #expect(!list.hasPreviousPage)
        #expect(list.hasNextPage)

        await list.loadNextPage()
        #expect(list.page == 2)
        #expect(!list.hasNextPage)

        // Already on the last page — loadNextPage must be a no-op, not request page 3.
        await list.loadNextPage()
        #expect(list.page == 2)

        await list.loadPreviousPage()
        #expect(list.page == 1)
    }

    @Test func loadNextAppendingAccumulatesItemsAcrossPages() async {
        let list = OffsetPagedList<Fake>(pageSize: 2) { page, pageSize in
            (items: [Fake(id: (page - 1) * pageSize + 1), Fake(id: (page - 1) * pageSize + 2)],
             meta: PageMeta(page: page, pageSize: pageSize, total: 6, totalPages: 3))
        }
        await list.load(page: 1)
        #expect(list.items.map(\.id) == [1, 2])

        await list.loadNextAppending()
        #expect(list.items.map(\.id) == [1, 2, 3, 4])
        #expect(list.page == 2)

        await list.loadNextAppending()
        #expect(list.items.map(\.id) == [1, 2, 3, 4, 5, 6])
        #expect(list.page == 3)

        // Already on the last page — must be a no-op, not request page 4.
        await list.loadNextAppending()
        #expect(list.items.map(\.id) == [1, 2, 3, 4, 5, 6])
    }

    @Test func loadNextAppendingIfNeededTriggersNearTheEnd() async {
        let list = OffsetPagedList<Fake>(pageSize: 2) { page, pageSize in
            (items: [Fake(id: (page - 1) * pageSize + 1), Fake(id: (page - 1) * pageSize + 2)],
             meta: PageMeta(page: page, pageSize: pageSize, total: 4, totalPages: 2))
        }
        await list.load(page: 1)
        list.loadNextAppendingIfNeeded(currentItem: Fake(id: 1))
        // Give the fire-and-forget Task a beat to run.
        try? await Task.sleep(nanoseconds: 50_000_000)
        #expect(list.items.map(\.id) == [1, 2, 3, 4])
    }
}
