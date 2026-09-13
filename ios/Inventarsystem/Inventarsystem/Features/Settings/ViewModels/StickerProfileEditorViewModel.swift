import Foundation
import Observation
import UIKit

@MainActor
@Observable
final class StickerProfileEditorViewModel {
    /// One stored calibration sample. OCR (`recognizedLines`) runs once, when the sample is
    /// added — it's expensive and the image never changes. Which inventory-number candidates
    /// that text yields under the CURRENT draft rules is instead computed on the fly by the view
    /// (`StickerProfileMatcher.extract` is pure and cheap), so every edit to a pattern field
    /// updates every sample's result immediately, with no re-run button needed.
    struct SampleResult: Identifiable {
        let filename: String
        var image: UIImage?
        var recognizedLines: [String] = []
        var isRecognizing = false
        var id: String { filename }
    }

    var draft: StickerProfile
    let isNew: Bool
    private(set) var samples: [SampleResult] = []
    private(set) var isSaving = false
    var errorMessage: String?

    private let service: StickerProfileServicing
    private let store: StickerProfileStore

    init(profile: StickerProfile?, service: StickerProfileServicing = StickerProfileService(), store: StickerProfileStore = .shared) {
        self.service = service
        self.store = store
        if let profile {
            draft = profile
            isNew = false
        } else {
            draft = StickerProfile(name: "", praefix: "", ankerBegriffe: [], extraktionsMuster: [])
            isNew = true
        }
        samples = draft.beispielbilder.map { filename in
            SampleResult(filename: filename, image: StickerExampleImageStore.load(filename))
        }
        for sample in samples {
            Task { await runRecognition(for: sample.filename) }
        }
    }

    var isValid: Bool {
        !draft.name.trimmingCharacters(in: .whitespaces).isEmpty
            && !draft.praefix.isEmpty
            && !draft.extraktionsMuster.isEmpty
            && draft.extraktionsMuster.allSatisfy(Self.isValidRegex)
            && draft.ausschlussMuster.allSatisfy(Self.isValidRegex)
    }

    static func isValidRegex(_ pattern: String) -> Bool {
        !pattern.isEmpty && (try? NSRegularExpression(pattern: pattern)) != nil
    }

    /// The candidates the CURRENT draft rules would extract from an already-recognized sample —
    /// recomputed live on every call, so the calibration UI can call it straight from `body`.
    func candidates(for sample: SampleResult) -> [String] {
        StickerProfileMatcher.extract(from: sample.recognizedLines, profile: draft)?.candidates ?? []
    }

    func addSample(_ image: UIImage) async {
        guard let filename = StickerExampleImageStore.save(image) else {
            errorMessage = "Bild konnte nicht gespeichert werden."
            return
        }
        draft.beispielbilder.append(filename)
        LocalStickerExampleRegistry.add(filename, for: draft.id)
        samples.append(SampleResult(filename: filename, image: image))
        await runRecognition(for: filename)
    }

    func removeSample(_ filename: String) {
        draft.beispielbilder.removeAll { $0 == filename }
        LocalStickerExampleRegistry.remove(filename, for: draft.id)
        samples.removeAll { $0.filename == filename }
        StickerExampleImageStore.delete(filename)
    }

    private func runRecognition(for filename: String) async {
        guard let index = samples.firstIndex(where: { $0.filename == filename }) else { return }
        guard let image = samples[index].image ?? StickerExampleImageStore.load(filename) else { return }
        samples[index].isRecognizing = true
        samples[index].recognizedLines = await StickerTextRecognizer.recognizeLines(in: image)
        samples[index].isRecognizing = false
    }

    /// Saves via the backend (create or update), so the profile is immediately visible to every
    /// other device/user — exclusivity of `isDefault` is enforced server-side. Returns whether
    /// the save succeeded, so the view only dismisses on success.
    func save() async -> Bool {
        isSaving = true
        defer { isSaving = false }
        let input = StickerProfileInput(from: draft)
        do {
            if isNew {
                let created = try await service.create(input)
                LocalStickerExampleRegistry.migrate(from: draft.id, to: created.id)
            } else {
                _ = try await service.update(id: draft.id, input)
            }
            await store.refresh()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Sticker-Profil konnte nicht gespeichert werden."
            return false
        }
    }
}
