import Testing
import Foundation
@testable import Inventarsystem

/// Regression coverage for the backend-outage scenario: moving sticker profiles to the backend
/// means a failed fetch must never leave the on-device scanner with zero profiles — it should
/// fall back to the disk cache from the last successful sync, or to the seeded default if there
/// never was one, rather than clearing `profiles`.
@Suite(.serialized)
struct StickerProfileStoreTests {
    private struct StubService: StickerProfileServicing {
        var fetchResult: Result<[StickerProfile], Error> = .failure(APIError.network(underlying: URLError(.notConnectedToInternet)))

        func fetchAll() async throws -> [StickerProfile] { try fetchResult.get() }
        func create(_ input: StickerProfileInput) async throws -> StickerProfile { fatalError("not used") }
        func update(id: String, _ input: StickerProfileInput) async throws -> StickerProfile { fatalError("not used") }
        func delete(id: String) async throws {}
    }

    private static func temporaryCacheURL() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("sticker-profile-store-test-\(UUID().uuidString).json")
    }

    @Test @MainActor func fallsBackToSeededDefaultWhenNoCacheAndFetchFails() async {
        let store = StickerProfileStore(service: StubService(), cacheURL: Self.temporaryCacheURL())
        #expect(store.profiles == [.ejbStandard])

        await store.refresh()

        #expect(store.profiles == [.ejbStandard])
        #expect(store.errorMessage != nil)
    }

    @Test @MainActor func keepsLastKnownGoodProfilesWhenARefreshLaterFails() async {
        let cacheURL = Self.temporaryCacheURL()
        let synced = StickerProfile(name: "Custom", praefix: "CUST", ankerBegriffe: [], extraktionsMuster: [#"CUST([0-9]+)"#])

        var service = StubService()
        service.fetchResult = .success([synced])
        let store = StickerProfileStore(service: service, cacheURL: cacheURL)
        await store.refresh()
        #expect(store.profiles == [synced])

        // A fresh store (simulating a relaunch) should pick up the disk cache immediately...
        let reopenedStore = StickerProfileStore(service: StubService(), cacheURL: cacheURL)
        #expect(reopenedStore.profiles == [synced])

        // ...and a failed refresh must not discard it.
        await reopenedStore.refresh()
        #expect(reopenedStore.profiles == [synced])
    }

    @Test @MainActor func successfulRefreshOverwritesThePreviousCache() async {
        let cacheURL = Self.temporaryCacheURL()
        var service = StubService()
        service.fetchResult = .success([.ejbStandard])
        let store = StickerProfileStore(service: service, cacheURL: cacheURL)
        await store.refresh()

        let updated = StickerProfile(name: "Updated", praefix: "UPD", ankerBegriffe: [], extraktionsMuster: [#"UPD([0-9]+)"#])
        service.fetchResult = .success([updated])
        let updatedStore = StickerProfileStore(service: service, cacheURL: cacheURL)
        await updatedStore.refresh()

        #expect(updatedStore.profiles == [updated])

        let reopenedAfterUpdate = StickerProfileStore(service: StubService(), cacheURL: cacheURL)
        #expect(reopenedAfterUpdate.profiles == [updated])
    }
}
