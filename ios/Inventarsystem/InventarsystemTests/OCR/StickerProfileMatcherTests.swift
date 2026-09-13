import Testing
import Foundation
@testable import Inventarsystem

/// Validates the default "EJB Standard" profile against all seven documented reference cases,
/// as literal OCR-line arrays standing in for what `RecognizeTextRequest` would emit for each
/// physical sticker described in the task — no images or Vision needed to cover this logic.
/// See `StickerVisionPipelineSmokeTests` for the separate, real-Vision pipeline check.
struct StickerProfileMatcherTests {

    struct Case {
        let name: String
        let ocrLines: [String]
        let expectedNumber: String
    }

    static let referenceCases: [Case] = [
        Case(
            name: "red EjB sticker, number in white field, device \"HPA 1\"",
            ocrLines: ["ejbe.de", "Jugendwerk Bernhausen", "0268", "HPA 1"],
            expectedNumber: "EJB 0268"
        ),
        Case(
            name: "silver label \"Nr: 000107\"",
            ocrLines: ["Nr: 000107"],
            expectedNumber: "EJB 000107"
        ),
        Case(
            name: "white label with red EjB logo, \"Nr. 704\", device \"IEM 7\"/\"5m\"",
            ocrLines: ["EjB", "Nr. 704", "IEM 7", "5m"],
            expectedNumber: "EJB 704"
        ),
        Case(
            name: "silver label on power supply \"Nr. 706\"",
            ocrLines: ["Nr. 706"],
            expectedNumber: "EJB 706"
        ),
        Case(
            name: "silver/copper label \"Nr: 000105\"",
            ocrLines: ["Nr: 000105"],
            expectedNumber: "EJB 000105"
        ),
        Case(
            name: "red EjB sticker, number in white field, device \"Blackmagic design\"",
            ocrLines: ["ejbe.de", "Jugendwerk Bernhausen", "0207", "Blackmagic design"],
            expectedNumber: "EJB 0207"
        ),
        Case(
            name: "white label already printed \"EJB 0267\"",
            ocrLines: ["EJB 0267"],
            expectedNumber: "EJB 0267"
        )
    ]

    @Test(arguments: referenceCases)
    func referenceStickerProducesExpectedNumber(_ testCase: Case) {
        let result = StickerProfileMatcher.scan(lines: testCase.ocrLines, profiles: [.ejbStandard])
        #expect(result?.candidates == [testCase.expectedNumber], "Case: \(testCase.name)")
    }

    // MARK: - Profile selection

    @Test func selectsTheOnlyProfileEvenWithNoAnchorHits() {
        let profile = StickerProfileMatcher.selectProfile(from: ["Nr: 000107"], profiles: [.ejbStandard])
        #expect(profile == .ejbStandard)
    }

    @Test func fallsBackToDefaultProfileWhenNoAnchorsMatchAmongSeveral() {
        var otherProfile = StickerProfile.ejbStandard
        otherProfile.id = UUID().uuidString
        otherProfile.name = "Anderes Profil"
        otherProfile.praefix = "XYZ"
        otherProfile.ankerBegriffe = ["ganzAndereFirma"]
        otherProfile.isDefault = false

        let profile = StickerProfileMatcher.selectProfile(from: ["Nr: 000107"], profiles: [otherProfile, .ejbStandard])
        #expect(profile == .ejbStandard)
    }

    @Test func picksTheHighestScoringProfileWhenAnchorsMatch() {
        var otherProfile = StickerProfile.ejbStandard
        otherProfile.id = UUID().uuidString
        otherProfile.name = "Anderes Profil"
        otherProfile.praefix = "XYZ"
        otherProfile.ankerBegriffe = ["ganzAndereFirma"]
        otherProfile.isDefault = false

        let profile = StickerProfileMatcher.selectProfile(from: ["ejbe.de", "Jugendwerk", "0268"], profiles: [otherProfile, .ejbStandard])
        #expect(profile == .ejbStandard)
    }

    @Test func returnsNilOnAGenuineTieBetweenScoringProfiles() {
        var profileA = StickerProfile.ejbStandard
        profileA.id = UUID().uuidString
        profileA.name = "Profil A"
        profileA.ankerBegriffe = ["Jugendwerk"]

        var profileB = StickerProfile.ejbStandard
        profileB.id = UUID().uuidString
        profileB.name = "Profil B"
        profileB.isDefault = false
        profileB.ankerBegriffe = ["Jugendwerk"]

        let profile = StickerProfileMatcher.selectProfile(from: ["Jugendwerk"], profiles: [profileA, profileB])
        #expect(profile == nil)
    }

    // MARK: - Anchor OCR-noise tolerance

    @Test func anchorMatchToleratesASingleOcrMisread() {
        // "Jugendwrk" (missing the 'e') should still be recognized as "Jugendwerk" — one
        // deletion, within the tolerated edit distance of 1 for anchors of 5+ characters.
        #expect(StickerProfileMatcher.textContains("Jugendwrk Bernhausen", anchor: "Jugendwerk"))
    }

    @Test func shortAnchorsRequireAnExactMatchNoFuzzing() {
        // "EjB" is only 3 characters — fuzzy-matching it would match almost any text and defeat
        // the point of anchor-based profile detection.
        #expect(!StickerProfileMatcher.textContains("xyz", anchor: "EjB"))
        #expect(StickerProfileMatcher.textContains("Das ist EjB", anchor: "EjB"))
    }

    @Test func unrelatedTextDoesNotFuzzyMatch() {
        #expect(!StickerProfileMatcher.textContains("Blackmagic design", anchor: "Jugendwerk"))
    }

    // MARK: - Multiple candidates

    @Test func multipleBareNumbersOnOneLabelProduceMultipleCandidatesInOrder() {
        let result = StickerProfileMatcher.extract(from: ["0123 0456"], profile: .ejbStandard)
        #expect(result?.candidates == ["EJB 0123", "EJB 0456"])
    }

    // MARK: - Exclusion patterns

    @Test func exclusionPatternsAreCaseInsensitive() {
        let result = StickerProfileMatcher.extract(from: ["ejb", "hpa 1", "0268"], profile: .ejbStandard)
        #expect(result?.candidates == ["EJB 0268"])
    }

    @Test func noExtractionWhenEveryLineIsExcludedOrUnmatched() {
        let result = StickerProfileMatcher.extract(from: ["HPA 1", "5m"], profile: .ejbStandard)
        #expect(result == nil)
    }

    // MARK: - Number formatting

    @Test func verbatimFormatKeepsLeadingZeros() {
        #expect(StickerProfile.ejbStandard.formattedNumber(from: "0042") == "EJB 0042")
    }

    @Test func stripLeadingZerosFormatRemovesThem() {
        var profile = StickerProfile.ejbStandard
        profile.zahlenFormat = .stripLeadingZeros
        #expect(profile.formattedNumber(from: "0042") == "EJB 42")
        #expect(profile.formattedNumber(from: "0000") == "EJB 0")
    }

    @Test func zeroPaddedFormatPadsToConfiguredLength() {
        var profile = StickerProfile.ejbStandard
        profile.zahlenFormat = .zeroPadded
        profile.padLength = 6
        #expect(profile.formattedNumber(from: "42") == "EJB 000042")
        #expect(profile.formattedNumber(from: "123456") == "EJB 123456")
    }
}
