import Foundation

/// The sticker-recognition matching engine — pure Foundation, zero Vision/UIKit imports, so it
/// is fully unit-testable against plain OCR-line-array inputs without a real image or the
/// Vision framework. `StickerTextRecognizer` (in `OCR/Vision`) is the only thing that feeds it
/// real recognized text; keeping the two separate is what makes this half genuinely testable.
///
/// Pipeline: pick the best-matching profile by anchor keywords → drop excluded lines → join the
/// rest → try each extraction pattern in order, first one that matches anything wins → format
/// every match of that pattern as a candidate.
nonisolated enum StickerProfileMatcher {

    /// Picks the best-matching profile for the given OCR lines, purely by anchor-keyword hits.
    /// Falls back to whichever profile is flagged `isDefault` when nothing scores above zero
    /// (e.g. a plain label with no branding text) — with only one profile stored, that profile
    /// always wins regardless. Returns `nil` on a genuine tie between several profiles that DID
    /// score, so the caller can ask the user to pick (only relevant once more than one profile
    /// is configured).
    static func selectProfile(from lines: [String], profiles: [StickerProfile]) -> StickerProfile? {
        guard !profiles.isEmpty else { return nil }
        let joined = lines.joined(separator: " ")

        let scored = profiles.map { profile -> (profile: StickerProfile, score: Int) in
            let score = profile.ankerBegriffe.reduce(into: 0) { count, anchor in
                if textContains(joined, anchor: anchor) { count += 1 }
            }
            return (profile, score)
        }

        guard let best = scored.max(by: { $0.score < $1.score }), best.score > 0 else {
            if let fallback = profiles.first(where: { $0.isDefault }) { return fallback }
            return profiles.count == 1 ? profiles[0] : nil
        }
        let tiedWithBest = scored.filter { $0.score == best.score }
        return tiedWithBest.count > 1 ? nil : best.profile
    }

    /// Runs extraction for an already-chosen profile.
    static func extract(from lines: [String], profile: StickerProfile) -> StickerExtractionResult? {
        let survivingLines = lines.filter { line in
            !profile.ausschlussMuster.contains { matches(pattern: $0, in: line) }
        }
        let joined = normalizeWhitespace(survivingLines.joined(separator: " "))

        for pattern in profile.extraktionsMuster {
            let digitGroups = allCaptures(pattern: pattern, in: joined)
            if !digitGroups.isEmpty {
                return StickerExtractionResult(profile: profile, candidates: digitGroups.map(profile.formattedNumber(from:)))
            }
        }
        return nil
    }

    /// Convenience: select a profile, then extract — the whole scan pipeline in one call.
    static func scan(lines: [String], profiles: [StickerProfile]) -> StickerExtractionResult? {
        guard let profile = selectProfile(from: lines, profiles: profiles) else { return nil }
        return extract(from: lines, profile: profile)
    }

    // MARK: - Anchor matching (case-insensitive, mildly OCR-noise-tolerant)

    /// Exact (case-insensitive) substring match first; for anchors of 5+ characters, also
    /// tolerates a single OCR misread (one substitution/insertion/deletion) via a windowed
    /// Levenshtein check. Anchors shorter than 5 characters require an exact match — fuzzy-
    /// matching a very short anchor (e.g. "EjB") would match almost anything and defeat the point.
    static func textContains(_ haystack: String, anchor: String) -> Bool {
        let normalizedHaystack = haystack.lowercased()
        let normalizedAnchor = anchor.lowercased()
        guard !normalizedAnchor.isEmpty else { return false }

        if normalizedHaystack.contains(normalizedAnchor) { return true }
        guard normalizedAnchor.count >= 5 else { return false }

        let haystackChars = Array(normalizedHaystack)
        let anchorLength = normalizedAnchor.count
        guard haystackChars.count >= anchorLength - 1 else {
            return levenshteinDistance(normalizedHaystack, normalizedAnchor) <= 1
        }

        var start = 0
        while start + max(anchorLength - 1, 1) <= haystackChars.count {
            for length in [anchorLength - 1, anchorLength, anchorLength + 1] where length > 0 && start + length <= haystackChars.count {
                let window = String(haystackChars[start..<(start + length)])
                if levenshteinDistance(window, normalizedAnchor) <= 1 { return true }
            }
            start += 1
        }
        return false
    }

    // MARK: - Regex helpers

    private static func matches(pattern: String, in text: String) -> Bool {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return false }
        return regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    private static func allCaptures(pattern: String, in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap { match in
            guard match.numberOfRanges > 1, let groupRange = Range(match.range(at: 1), in: text) else { return nil }
            return String(text[groupRange])
        }
    }

    private static func normalizeWhitespace(_ text: String) -> String {
        text.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }

    /// Standard iterative-DP edit distance.
    private static func levenshteinDistance(_ lhs: String, _ rhs: String) -> Int {
        let lhsChars = Array(lhs)
        let rhsChars = Array(rhs)
        if lhsChars.isEmpty { return rhsChars.count }
        if rhsChars.isEmpty { return lhsChars.count }

        var previousRow = Array(0...rhsChars.count)
        for i in 1...lhsChars.count {
            var currentRow = [i] + [Int](repeating: 0, count: rhsChars.count)
            for j in 1...rhsChars.count {
                let cost = lhsChars[i - 1] == rhsChars[j - 1] ? 0 : 1
                currentRow[j] = Swift.min(
                    previousRow[j] + 1,
                    currentRow[j - 1] + 1,
                    previousRow[j - 1] + cost
                )
            }
            previousRow = currentRow
        }
        return previousRow[rhsChars.count]
    }
}
