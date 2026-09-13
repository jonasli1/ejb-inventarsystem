import UIKit

/// Local on-disk storage for sticker-profile calibration example photos (JPEG files named by a
/// fresh UUID, referenced by filename from `StickerProfile.beispielbilder`). Kept in the
/// Settings feature rather than `OCR/ProfileMatching` because it touches `UIImage` — that
/// module's profile-matching layer is deliberately kept free of UIKit/Vision imports so it stays
/// unit-testable as pure logic.
nonisolated enum StickerExampleImageStore {
    private static var directory: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("StickerExamples", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    @discardableResult
    static func save(_ image: UIImage) -> String? {
        guard let data = image.jpegData(compressionQuality: 0.85) else { return nil }
        let filename = "\(UUID().uuidString).jpg"
        do {
            try data.write(to: directory.appendingPathComponent(filename), options: .atomic)
            return filename
        } catch {
            return nil
        }
    }

    static func load(_ filename: String) -> UIImage? {
        UIImage(contentsOfFile: directory.appendingPathComponent(filename).path)
    }

    static func delete(_ filename: String) {
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(filename))
    }
}
