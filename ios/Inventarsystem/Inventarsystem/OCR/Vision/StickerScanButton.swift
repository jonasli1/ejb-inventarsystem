import SwiftUI
import PhotosUI

/// The camera-icon scan action placed next to every inventory search field. Offers photo
/// capture or library selection, runs on-device OCR + profile matching, and hands the caller a
/// user-confirmed inventory number via `onScanned` — never writes into the search field silently.
struct StickerScanButton: View {
    var onScanned: (String) -> Void

    @State private var showSourceChoice = false
    @State private var showCamera = false
    @State private var showPhotoPicker = false
    @State private var photosPickerItem: PhotosPickerItem?
    @State private var isProcessing = false
    @State private var scanResult: StickerExtractionResult?
    @State private var showConfirmation = false
    @State private var showNoResultAlert = false

    private var isCameraAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    var body: some View {
        Button {
            showSourceChoice = true
        } label: {
            if isProcessing {
                ProgressView()
            } else {
                Image(systemName: "camera.viewfinder")
            }
        }
        .disabled(isProcessing)
        .accessibilityLabel("Inventarnummer per Foto suchen")
        .confirmationDialog("Inventarnummer scannen", isPresented: $showSourceChoice, titleVisibility: .visible) {
            if isCameraAvailable {
                Button("Foto aufnehmen") { showCamera = true }
            }
            Button("Aus Mediathek wählen") { showPhotoPicker = true }
            Button("Abbrechen", role: .cancel) {}
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraCaptureView { image in
                showCamera = false
                if let image {
                    Task { await process(image) }
                }
            }
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photosPickerItem, matching: .images)
        .onChange(of: photosPickerItem) { _, newValue in
            guard let newValue else { return }
            Task {
                if let data = try? await newValue.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    await process(image)
                }
                photosPickerItem = nil
            }
        }
        .sheet(isPresented: $showConfirmation) {
            if let scanResult {
                ScanConfirmationView(
                    result: scanResult,
                    onConfirm: { chosenNumber in
                        showConfirmation = false
                        onScanned(chosenNumber)
                    },
                    onCancel: { showConfirmation = false }
                )
            }
        }
        .alert("Keine Inventarnummer erkannt", isPresented: $showNoResultAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Im Foto konnte keine Inventarnummer erkannt werden. Bitte erneut versuchen oder die Nummer manuell eingeben.")
        }
    }

    private func process(_ image: UIImage) async {
        isProcessing = true
        defer { isProcessing = false }

        let lines = await StickerTextRecognizer.recognizeLines(in: image)
        let profiles = StickerProfileStore.shared.profiles
        if let result = StickerProfileMatcher.scan(lines: lines, profiles: profiles) {
            scanResult = result
            showConfirmation = true
        } else {
            showNoResultAlert = true
        }
    }
}
