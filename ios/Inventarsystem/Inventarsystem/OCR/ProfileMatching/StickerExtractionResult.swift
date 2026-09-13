import Foundation

/// The outcome of running `StickerProfileMatcher` against a set of recognized text lines.
nonisolated struct StickerExtractionResult: Sendable, Equatable {
    let profile: StickerProfile
    /// One or more formatted inventory-number candidates, in the order they appeared in the
    /// source text. A single candidate means "confident, prefill and confirm"; more than one
    /// means the user should pick which one is correct.
    let candidates: [String]
}
