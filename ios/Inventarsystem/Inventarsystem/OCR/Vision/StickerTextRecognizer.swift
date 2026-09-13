import Vision
import UIKit

/// Wraps Apple's Vision `RecognizeTextRequest` (iOS 18+, verified against the installed SDK's
/// `Vision.swiftinterface`: `recognitionLevel`, `usesLanguageCorrection`, and
/// `perform(on: CGImage, orientation:)` are the real, current property/method names). Fully
/// on-device — no network dependency, no cloud OCR service.
nonisolated enum StickerTextRecognizer {
    /// Recognizes text in `image`, returning one string per detected line/region — the raw
    /// input `StickerProfileMatcher` expects. Language correction is deliberately off: an
    /// inventory number like "0268" isn't a real word, and spelling "correction" would corrupt it.
    static func recognizeLines(in image: UIImage) async -> [String] {
        guard let cgImage = image.cgImage else { return [] }

        var request = RecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false

        do {
            let observations = try await request.perform(
                on: cgImage,
                orientation: cgOrientation(for: image.imageOrientation)
            )
            return observations.compactMap { $0.topCandidates(1).first?.string }
        } catch {
            return []
        }
    }

    /// `UIImage.imageOrientation` (from EXIF/camera metadata) must be translated for Vision,
    /// since a bare `CGImage` carries no orientation of its own — skipping this would garble
    /// recognition on any photo that isn't already upright.
    private static func cgOrientation(for uiOrientation: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch uiOrientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
