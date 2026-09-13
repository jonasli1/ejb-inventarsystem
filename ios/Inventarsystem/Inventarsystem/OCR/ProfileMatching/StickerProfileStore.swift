import Foundation
import Observation

/// In-memory cache of the server-stored sticker profiles (`GET /sticker-profiles`) — profiles
/// are shared across every device/user (see `StickerProfileService`), refreshed at login and
/// whenever Settings' calibration UI creates/edits/deletes one. Kept as a single shared store,
/// rather than every call site fetching independently, so the OCR scan button never blocks on a
/// network round-trip at the exact moment of scanning — profiles are expected to already be
/// loaded by then.
///
/// Layered resilience so a backend outage never fully breaks on-device scanning: the last
/// successfully-fetched list is cached to disk and shown immediately on the next launch, and a
/// failed refresh falls back to that disk cache rather than clearing `profiles` — with the
/// seeded `.ejbStandard` fixture as the final fallback if there's no cache yet either (e.g.
/// first launch with no connectivity). A successful refresh always overwrites both.
@MainActor
@Observable
final class StickerProfileStore {
    private(set) var profiles: [StickerProfile]
    private(set) var isLoading = false
    var errorMessage: String?

    private let service: StickerProfileServicing
    private let cacheURL: URL

    static let shared = StickerProfileStore()

    init(service: StickerProfileServicing = StickerProfileService(), cacheURL: URL? = nil) {
        self.service = service
        self.cacheURL = cacheURL ?? Self.defaultCacheURL()
        profiles = Self.loadCache(from: self.cacheURL) ?? [.ejbStandard]
    }

    /// Re-fetches from the backend and re-attaches each profile's local-only example-image
    /// filenames (never part of the server payload — see `StickerProfile.beispielbilder`). On
    /// failure, keeps whatever's already loaded (disk cache or the seeded default) instead of
    /// leaving the scanner with zero profiles.
    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            var fetched = try await service.fetchAll()
            for index in fetched.indices {
                fetched[index].beispielbilder = LocalStickerExampleRegistry.filenames(for: fetched[index].id)
            }
            profiles = fetched
            saveCache()
            errorMessage = nil
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "Sticker-Profile konnten nicht aktualisiert werden – zeige zuletzt bekannte Profile."
        }
    }

    private static func defaultCacheURL() -> URL {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("stickerProfilesCache.json")
    }

    private static func loadCache(from url: URL) -> [StickerProfile]? {
        guard let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([StickerProfile].self, from: data),
              !decoded.isEmpty
        else { return nil }
        var withLocalExamples = decoded
        for index in withLocalExamples.indices {
            withLocalExamples[index].beispielbilder = LocalStickerExampleRegistry.filenames(for: withLocalExamples[index].id)
        }
        return withLocalExamples
    }

    private func saveCache() {
        guard let data = try? JSONEncoder().encode(profiles) else { return }
        try? data.write(to: cacheURL, options: .atomic)
    }
}
