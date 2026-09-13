import Foundation

/// Maps a (server-issued) `StickerProfile.id` to the filenames of calibration example photos
/// saved on THIS device (see `StickerExampleImageStore`). Profiles themselves are shared across
/// devices via the backend, but example photos are a local testing aid only — this registry is
/// what lets a profile fetched from the server "remember" which local sample images belong to it.
nonisolated enum LocalStickerExampleRegistry {
    private static let defaultsKey = "stickerProfileExampleImagesByProfileID"

    private static func loadAll() -> [String: [String]] {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let decoded = try? JSONDecoder().decode([String: [String]].self, from: data)
        else { return [:] }
        return decoded
    }

    private static func saveAll(_ mapping: [String: [String]]) {
        guard let data = try? JSONEncoder().encode(mapping) else { return }
        UserDefaults.standard.set(data, forKey: defaultsKey)
    }

    static func filenames(for profileID: String) -> [String] {
        loadAll()[profileID] ?? []
    }

    static func add(_ filename: String, for profileID: String) {
        var all = loadAll()
        all[profileID, default: []].append(filename)
        saveAll(all)
    }

    static func remove(_ filename: String, for profileID: String) {
        var all = loadAll()
        all[profileID]?.removeAll { $0 == filename }
        saveAll(all)
    }

    static func removeAll(for profileID: String) {
        var all = loadAll()
        all.removeValue(forKey: profileID)
        saveAll(all)
    }

    /// Called once a newly-created profile's real server id comes back, to re-home example
    /// images that were added while the draft still had a temporary client-side id.
    static func migrate(from oldProfileID: String, to newProfileID: String) {
        guard oldProfileID != newProfileID else { return }
        var all = loadAll()
        if let filenames = all.removeValue(forKey: oldProfileID) {
            all[newProfileID] = filenames
        }
        saveAll(all)
    }
}
