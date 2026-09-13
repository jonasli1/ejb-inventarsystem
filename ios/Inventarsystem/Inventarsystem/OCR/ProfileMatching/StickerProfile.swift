import Foundation

/// A configurable sticker/label profile for the on-device inventory-number scanner. The
/// recognition pipeline is deliberately not hardcoded to one sticker design — `ankerBegriffe`
/// decide which profile a scanned image belongs to, and `extraktionsMuster`/`ausschlussMuster`/
/// `zahlenFormat` decide how the inventory number is pulled out of the recognized text.
///
/// The matching rules are stored server-side (`StickerProfileService`/`GET /sticker-profiles`)
/// so a profile calibrated once is shared across every device and user — only `beispielbilder`
/// (example calibration photos) stay local to each device, since they're just a testing aid, not
/// part of the actual matching logic. `Encodable` is only used locally, for
/// `StickerProfileStore`'s offline cache (see `CodingKeys` — `beispielbilder` is excluded from
/// both directions since it's re-derived from `LocalStickerExampleRegistry` after load anyway).
nonisolated struct StickerProfile: Codable, Identifiable, Sendable, Hashable {
    enum NumberFormat: String, Codable, Sendable {
        /// Keep the captured digits exactly as recognized, including leading zeros.
        case verbatim
        /// Strip leading zeros (e.g. "0268" -> "268").
        case stripLeadingZeros
        /// Pad with leading zeros up to `padLength`.
        case zeroPadded
    }

    var id: String
    var name: String
    var praefix: String
    var trenner: String
    /// Keywords that identify this profile from the recognized text — case-insensitive and
    /// tolerant of minor OCR noise (see `StickerProfileMatcher.textContains`).
    var ankerBegriffe: [String]
    /// Ordered regex list, each with exactly one capture group for the number. The first
    /// pattern that matches anything wins — order matters, most specific first.
    var extraktionsMuster: [String]
    /// Regex list for text to ignore before extraction runs (model/type codes, cable lengths,
    /// brand names printed near the real number). Matching lines are dropped entirely.
    var ausschlussMuster: [String]
    var zahlenFormat: NumberFormat
    var padLength: Int
    /// Used when no profile's anchors match at all (e.g. a plain label with no branding text).
    var isDefault: Bool
    /// Local filenames of example photos saved for this profile during setup/calibration on
    /// THIS device — never part of the server payload (see `CodingKeys`).
    var beispielbilder: [String]

    private enum CodingKeys: String, CodingKey {
        case id, name, praefix, trenner, ankerBegriffe, extraktionsMuster, ausschlussMuster, zahlenFormat, padLength, isDefault
    }

    init(
        id: String = UUID().uuidString,
        name: String,
        praefix: String,
        trenner: String = " ",
        ankerBegriffe: [String] = [],
        extraktionsMuster: [String],
        ausschlussMuster: [String] = [],
        zahlenFormat: NumberFormat = .verbatim,
        padLength: Int = 0,
        isDefault: Bool = false,
        beispielbilder: [String] = []
    ) {
        self.id = id
        self.name = name
        self.praefix = praefix
        self.trenner = trenner
        self.ankerBegriffe = ankerBegriffe
        self.extraktionsMuster = extraktionsMuster
        self.ausschlussMuster = ausschlussMuster
        self.zahlenFormat = zahlenFormat
        self.padLength = padLength
        self.isDefault = isDefault
        self.beispielbilder = beispielbilder
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        praefix = try container.decode(String.self, forKey: .praefix)
        trenner = try container.decode(String.self, forKey: .trenner)
        ankerBegriffe = try container.decodeIfPresent([String].self, forKey: .ankerBegriffe) ?? []
        extraktionsMuster = try container.decode([String].self, forKey: .extraktionsMuster)
        ausschlussMuster = try container.decodeIfPresent([String].self, forKey: .ausschlussMuster) ?? []
        zahlenFormat = try container.decodeIfPresent(NumberFormat.self, forKey: .zahlenFormat) ?? .verbatim
        padLength = try container.decodeIfPresent(Int.self, forKey: .padLength) ?? 0
        isDefault = try container.decodeIfPresent(Bool.self, forKey: .isDefault) ?? false
        beispielbilder = []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(praefix, forKey: .praefix)
        try container.encode(trenner, forKey: .trenner)
        try container.encode(ankerBegriffe, forKey: .ankerBegriffe)
        try container.encode(extraktionsMuster, forKey: .extraktionsMuster)
        try container.encode(ausschlussMuster, forKey: .ausschlussMuster)
        try container.encode(zahlenFormat, forKey: .zahlenFormat)
        try container.encode(padLength, forKey: .padLength)
        try container.encode(isDefault, forKey: .isDefault)
    }

    /// A fixture matching the backend's seeded default profile — used by SwiftUI Previews and
    /// by the pure-logic unit tests (`StickerProfileMatcherTests`), which need no live backend.
    static let ejbStandard = StickerProfile(
        name: "EJB Standard",
        praefix: "EJB",
        trenner: " ",
        ankerBegriffe: ["ejbe.de", "Jugendwerk", "Bernhausen", "EjB"],
        extraktionsMuster: [
            #"EJB\s*([0-9]{2,6})"#,
            #"Nr[:.]?\s*([0-9]{2,6})"#,
            #"\b([0-9]{3,6})\b"#
        ],
        ausschlussMuster: [
            #"\b[A-Z]{2,4}\s?\d\b"#,
            #"\b\d+\s?m\b"#,
            #"Blackmagic\s*design"#,
            #"LD\s*Systems"#,
            #"KLOTZ\s*LY225T"#
        ],
        zahlenFormat: .verbatim,
        isDefault: true
    )

    /// Applies `zahlenFormat` and assembles the final inventory number, e.g. `"EJB 0268"`.
    func formattedNumber(from digits: String) -> String {
        let formattedDigits: String
        switch zahlenFormat {
        case .verbatim:
            formattedDigits = digits
        case .stripLeadingZeros:
            let stripped = digits.drop { $0 == "0" }
            formattedDigits = stripped.isEmpty ? "0" : String(stripped)
        case .zeroPadded:
            formattedDigits = digits.count >= padLength
                ? digits
                : String(repeating: "0", count: padLength - digits.count) + digits
        }
        return "\(praefix)\(trenner)\(formattedDigits)"
    }
}
