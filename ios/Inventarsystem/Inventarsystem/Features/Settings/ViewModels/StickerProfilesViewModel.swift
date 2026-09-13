import Foundation
import Observation

@MainActor
@Observable
final class StickerProfilesViewModel {
    let store: StickerProfileStore
    private let service: StickerProfileServicing
    var errorMessage: String?
    private(set) var isProcessing = false

    init(store: StickerProfileStore = .shared, service: StickerProfileServicing = StickerProfileService()) {
        self.store = store
        self.service = service
    }

    var profiles: [StickerProfile] { store.profiles }
    var isLoading: Bool { store.isLoading }

    func load() async {
        await store.refresh()
    }

    func delete(_ profile: StickerProfile) async {
        isProcessing = true
        defer { isProcessing = false }
        do {
            try await service.delete(id: profile.id)
            for filename in profile.beispielbilder {
                StickerExampleImageStore.delete(filename)
            }
            LocalStickerExampleRegistry.removeAll(for: profile.id)
            await store.refresh()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Sticker-Profil konnte nicht gelöscht werden."
        }
    }

    func makeDefault(_ profile: StickerProfile) async {
        guard !profile.isDefault else { return }
        isProcessing = true
        defer { isProcessing = false }
        var input = StickerProfileInput(from: profile)
        input.isDefault = true
        do {
            _ = try await service.update(id: profile.id, input)
            await store.refresh()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Sticker-Profil konnte nicht aktualisiert werden."
        }
    }
}
