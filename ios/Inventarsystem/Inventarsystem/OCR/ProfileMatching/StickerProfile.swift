import Foundation

/// A configurable sticker/label profile for the on-device inventory-number scanner. The
/// recognition pipeline is deliberately not hardcoded to one sticker design — `ankerBegriffe`
/// decide which profile a scanned image belongs to, and `extraktionsMuster`/`ausschlussMuster`/
/// `zahlenFormat` decide how the inventory number is pulled out of the recognized text.
nonisolated struct StickerProfile: Codable, Identifiable, Sendable, Hashable {
    enum NumberFormat: String, Codable, Sendable {
        /// Keep the captured digits exactly as recognized, including leading zeros.
        case verbatim
        /// Strip leading zeros (e.g. "0268" -> "268").
        case stripLeadingZeros
        /// Pad with leading zeros up to `padLength`.
        case zeroPadded
    }

    var id: UUID
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
    /// Local filenames of example photos saved for this profile during setup/calibration.
    var beispielbilder: [String]

    init(
        id: UUID = UUID(),
        name: String,
        praefix: String,
        trenner: String = " ",
        ankerBegriffe: [String],
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

    /// The seeded default profile, derived from the physical EjB stickers this feature was
    /// specified against: a red sticker with the number in a white field, a silver/copper
    /// "Nr: …" label, and a white label already printed "EJB ####".
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
