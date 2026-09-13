import Foundation
import Observation

/// Local JSON persistence for sticker profiles — seeds the "EJB Standard" profile on first
/// launch. This does file I/O, so unlike `StickerProfile`/`StickerProfileMatcher` it isn't part
/// of the pure-logic layer, but it's still profile-domain code and has no Vision/UIKit
/// dependency either.
@MainActor
@Observable
final class StickerProfileStore {
    private(set) var profiles: [StickerProfile] = []

    private let fileURL: URL

    static let shared = StickerProfileStore()

    init(fileURL: URL? = nil) {
        self.fileURL = fileURL ?? Self.defaultFileURL()
        load()
    }

    private static func defaultFileURL() -> URL {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("stickerProfiles.json")
    }

    func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode([StickerProfile].self, from: data),
              !decoded.isEmpty
        else {
            profiles = [.ejbStandard]
            save()
            return
        }
        profiles = decoded
    }

    func save() {
        guard let data = try? JSONEncoder().encode(profiles) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    func upsert(_ profile: StickerProfile) {
        if let index = profiles.firstIndex(where: { $0.id == profile.id }) {
            profiles[index] = profile
        } else {
            profiles.append(profile)
        }
        save()
    }

    func delete(_ profile: StickerProfile) {
        profiles.removeAll { $0.id == profile.id }
        if profiles.isEmpty { profiles = [.ejbStandard] }
        save()
    }

    /// Exports all profiles as pretty-printed JSON for sharing/backup.
    func exportJSON() -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try? encoder.encode(profiles)
    }

    /// Imports profiles from previously-exported JSON, merging by id (existing profiles with a
    /// matching id are replaced, new ones are appended).
    func importJSON(_ data: Data) throws {
        let imported = try JSONDecoder().decode([StickerProfile].self, from: data)
        for profile in imported {
            upsert(profile)
        }
    }
}
