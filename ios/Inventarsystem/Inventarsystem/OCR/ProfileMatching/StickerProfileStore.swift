import Foundation
import Observation

/// In-memory cache of the server-stored sticker profiles (`GET /sticker-profiles`) — profiles
/// are shared across every device/user (see `StickerProfileService`), refreshed at login and
/// whenever Settings' calibration UI creates/edits/deletes one. Kept as a single shared store,
/// rather than every call site fetching independently, so the OCR scan button never blocks on a
/// network round-trip at the exact moment of scanning — profiles are expected to already be
/// loaded by then.
@MainActor
@Observable
final class StickerProfileStore {
    private(set) var profiles: [StickerProfile] = []
    private(set) var isLoading = false
    var errorMessage: String?

    private let service: StickerProfileServicing

    static let shared = StickerProfileStore()

    init(service: StickerProfileServicing = StickerProfileService()) {
        self.service = service
    }

    /// Re-fetches from the backend and re-attaches each profile's local-only example-image
    /// filenames (never part of the server payload — see `StickerProfile.beispielbilder`).
    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            var fetched = try await service.fetchAll()
            for index in fetched.indices {
                fetched[index].beispielbilder = LocalStickerExampleRegistry.filenames(for: fetched[index].id)
            }
            profiles = fetched
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Sticker-Profile konnten nicht geladen werden."
        }
    }
}
