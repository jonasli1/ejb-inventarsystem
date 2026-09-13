import Foundation
import Observation
import UniformTypeIdentifiers

@MainActor
@Observable
final class StickerProfilesViewModel {
    let store: StickerProfileStore
    var errorMessage: String?
    var exportedFileURL: URL?

    init(store: StickerProfileStore = .shared) {
        self.store = store
    }

    var profiles: [StickerProfile] { store.profiles }

    func delete(at offsets: IndexSet) {
        for index in offsets {
            let profile = store.profiles[index]
            for filename in profile.beispielbilder {
                StickerExampleImageStore.delete(filename)
            }
            store.delete(profile)
        }
    }

    func makeDefault(_ profile: StickerProfile) {
        for var current in store.profiles {
            let shouldBeDefault = current.id == profile.id
            guard current.isDefault != shouldBeDefault else { continue }
            current.isDefault = shouldBeDefault
            store.upsert(current)
        }
    }

    /// Writes all profiles as pretty-printed JSON to a temp file for sharing via the system
    /// share sheet — profiles are local-only (no backend endpoint for them), so export/import is
    /// the only way to move a calibrated set between devices.
    func exportProfiles() {
        guard let data = store.exportJSON() else {
            errorMessage = "Profile konnten nicht exportiert werden."
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("sticker-profile.json")
        do {
            try data.write(to: url, options: .atomic)
            exportedFileURL = url
        } catch {
            errorMessage = "Profile konnten nicht exportiert werden."
        }
    }

    func importProfiles(from url: URL) {
        do {
            let needsAccess = url.startAccessingSecurityScopedResource()
            defer { if needsAccess { url.stopAccessingSecurityScopedResource() } }
            let data = try Data(contentsOf: url)
            try store.importJSON(data)
        } catch {
            errorMessage = "Die Datei enthält keine gültigen Sticker-Profile."
        }
    }
}
