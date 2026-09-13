import Foundation

nonisolated protocol StickerProfileServicing: Sendable {
    /// `GET /sticker-profiles` — readable by any authenticated user (no special permission),
    /// since every device needs these to run the on-device scanner.
    func fetchAll() async throws -> [StickerProfile]
    /// Requires `settings.manage_sticker_profiles`.
    func create(_ input: StickerProfileInput) async throws -> StickerProfile
    /// Requires `settings.manage_sticker_profiles`.
    func update(id: String, _ input: StickerProfileInput) async throws -> StickerProfile
    /// Requires `settings.manage_sticker_profiles`.
    func delete(id: String) async throws
}

/// The mutable fields sent to `POST`/`PUT /sticker-profiles` — mirrors the backend's
/// `CreateStickerProfileDto`/`UpdateStickerProfileDto` exactly. `id` is never part of the body
/// (assigned server-side on create, taken from the URL path on update).
nonisolated struct StickerProfileInput: Encodable, Sendable {
    var name: String
    var praefix: String
    var trenner: String
    var ankerBegriffe: [String]
    var extraktionsMuster: [String]
    var ausschlussMuster: [String]
    var zahlenFormat: StickerProfile.NumberFormat
    var padLength: Int
    var isDefault: Bool

    init(from profile: StickerProfile) {
        name = profile.name
        praefix = profile.praefix
        trenner = profile.trenner
        ankerBegriffe = profile.ankerBegriffe
        extraktionsMuster = profile.extraktionsMuster
        ausschlussMuster = profile.ausschlussMuster
        zahlenFormat = profile.zahlenFormat
        padLength = profile.padLength
        isDefault = profile.isDefault
    }
}

nonisolated struct StickerProfileService: StickerProfileServicing {
    func fetchAll() async throws -> [StickerProfile] {
        try await APIClient.shared.request("sticker-profiles")
    }

    func create(_ input: StickerProfileInput) async throws -> StickerProfile {
        try await APIClient.shared.request("sticker-profiles", method: "POST", body: input)
    }

    func update(id: String, _ input: StickerProfileInput) async throws -> StickerProfile {
        try await APIClient.shared.request("sticker-profiles/\(id)", method: "PUT", body: input)
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("sticker-profiles/\(id)", method: "DELETE")
    }
}
