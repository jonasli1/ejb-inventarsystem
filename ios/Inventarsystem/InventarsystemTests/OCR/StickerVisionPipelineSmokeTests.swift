import Testing
import UIKit
@testable import Inventarsystem

/// Real end-to-end Vision pipeline check against synthetic (code-rendered) sticker images —
/// deliberately kept separate from `StickerProfileMatcherTests`. A clean CoreGraphics-rendered
/// string on a flat background recognizes essentially perfectly every time; passing here
/// validates that Vision + `StickerTextRecognizer` + `StickerProfileMatcher` are wired together
/// correctly, NOT that OCR will handle a real, skewed, glare-affected, physical sticker photo.
///
/// The manifest below also lists the seven real reference photos from the task's fixture table
/// by their expected filenames. They are intentionally not committed to the repo (no such
/// photos exist anywhere in this project — see the iOS README), so their manifest entries are
/// skipped, not failed, whenever the file is absent. Dropping the real photos into
/// `InventarsystemTests/Fixtures/StickerImages/` under those exact names later is a pure
/// asset-folder change; no test code changes are needed to pick them up.
struct StickerVisionPipelineSmokeTests {

    struct ManifestEntry {
        let fileName: String
        let expectedNumber: String
    }

    static let manifest: [ManifestEntry] = [
        // Synthetic stand-ins, committed to the repo, always present:
        .init(fileName: "synthetic_ejb_prefixed.png", expectedNumber: "EJB 0268"),
        .init(fileName: "synthetic_nr_label_rotated.png", expectedNumber: "EJB 000107"),
        .init(fileName: "synthetic_noisy_background.png", expectedNumber: "EJB 0207"),
        .init(fileName: "synthetic_monospace_with_distractors.png", expectedNumber: "EJB 704"),
        // Real reference photos from the task's fixture table — drop them in with these exact
        // names to extend coverage to genuine physical stickers; skipped until then.
        .init(fileName: "reference_01_red_ejb_hpa1.jpg", expectedNumber: "EJB 0268"),
        .init(fileName: "reference_02_silver_nr_000107.jpg", expectedNumber: "EJB 000107"),
        .init(fileName: "reference_03_white_ejb_logo_nr704.jpg", expectedNumber: "EJB 704"),
        .init(fileName: "reference_04_silver_netzteil_nr706.jpg", expectedNumber: "EJB 706"),
        .init(fileName: "reference_05_silver_copper_nr_000105.jpg", expectedNumber: "EJB 000105"),
        .init(fileName: "reference_06_red_ejb_blackmagic.jpg", expectedNumber: "EJB 0207"),
        .init(fileName: "reference_07_white_label_ejb_0267.jpg", expectedNumber: "EJB 0267")
    ]

    @Test(arguments: manifest)
    func manifestImageProducesExpectedNumber(_ entry: ManifestEntry) async {
        guard let image = Self.loadFixtureImage(named: entry.fileName) else {
            return // Not present yet (expected for the real-photo entries) — not a failure.
        }
        let lines = await StickerTextRecognizer.recognizeLines(in: image)
        let result = StickerProfileMatcher.scan(lines: lines, profiles: [.ejbStandard])
        #expect(
            result?.candidates.contains(entry.expectedNumber) == true,
            "File: \(entry.fileName), recognized lines: \(lines), result: \(String(describing: result))"
        )
    }

    /// Guards against the whole suite silently testing nothing (e.g. a build misconfiguration
    /// that stops the fixtures from being copied into the test bundle).
    @Test func syntheticFixturesAreActuallyBundledAndLoadable() {
        let syntheticNames = [
            "synthetic_ejb_prefixed.png",
            "synthetic_nr_label_rotated.png",
            "synthetic_noisy_background.png",
            "synthetic_monospace_with_distractors.png"
        ]
        for name in syntheticNames {
            #expect(Self.loadFixtureImage(named: name) != nil, "Missing synthetic fixture: \(name)")
        }
    }

    private static func loadFixtureImage(named fileName: String) -> UIImage? {
        let bundle = Bundle(for: BundleMarker.self)
        let nsName = fileName as NSString
        guard let url = bundle.url(forResource: nsName.deletingPathExtension, withExtension: nsName.pathExtension),
              let data = try? Data(contentsOf: url)
        else { return nil }
        return UIImage(data: data)
    }

    private final class BundleMarker {}
}
