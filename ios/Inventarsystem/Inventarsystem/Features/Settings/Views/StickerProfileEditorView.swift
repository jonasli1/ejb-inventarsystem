import SwiftUI
import PhotosUI

/// Create/edit a `StickerProfile` with live example-image calibration: add a sample photo, see
/// what the current rules extract from it, adjust Ankerbegriffe/Extraktionsmuster/Ausschlussmuster,
/// and watch every stored sample's result update immediately.
struct StickerProfileEditorView: View {
    @State private var viewModel: StickerProfileEditorViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var showSourceChoice = false
    @State private var showCamera = false
    @State private var showPhotoPicker = false
    @State private var photosPickerItem: PhotosPickerItem?

    init(profile: StickerProfile?) {
        _viewModel = State(initialValue: StickerProfileEditorViewModel(profile: profile))
    }

    var body: some View {
        Form {
            Section("Allgemein") {
                TextField("Name", text: $viewModel.draft.name)
                TextField("Präfix (z. B. „EJB“)", text: $viewModel.draft.praefix)
                    .autocorrectionDisabled()
                TextField("Trennzeichen", text: $viewModel.draft.trenner)
                    .autocorrectionDisabled()
                Toggle("Standardprofil", isOn: $viewModel.draft.isDefault)
            }

            Section {
                Picker("Zahlenformat", selection: $viewModel.draft.zahlenFormat) {
                    Text("Unverändert").tag(StickerProfile.NumberFormat.verbatim)
                    Text("Führende Nullen entfernen").tag(StickerProfile.NumberFormat.stripLeadingZeros)
                    Text("Mit Nullen auffüllen").tag(StickerProfile.NumberFormat.zeroPadded)
                }
                if viewModel.draft.zahlenFormat == .zeroPadded {
                    Stepper("Stellen: \(viewModel.draft.padLength)", value: $viewModel.draft.padLength, in: 1...10)
                }
            } header: {
                Text("Zahlenformat")
            } footer: {
                Text("Beispiel: „\(viewModel.draft.formattedNumber(from: "0268"))“")
            }

            Section {
                StringListEditor(items: $viewModel.draft.ankerBegriffe, placeholder: "z. B. Jugendwerk")
            } header: {
                Text("Ankerbegriffe")
            } footer: {
                Text("Anhand dieser Begriffe erkennt die App, welches Profil zu einem Foto passt (Groß-/Kleinschreibung wird ignoriert).")
            }

            Section {
                StringListEditor(
                    items: $viewModel.draft.extraktionsMuster,
                    placeholder: "Regulärer Ausdruck",
                    monospaced: true,
                    reorderable: true,
                    invalid: { !StickerProfileEditorViewModel.isValidRegex($0) }
                )
            } header: {
                Text("Erkennungsmuster")
            } footer: {
                Text("Reihenfolge zählt: Das erste passende Muster gewinnt. Genau eine Erfassungsgruppe pro Muster für die Nummer.")
            }

            Section {
                StringListEditor(
                    items: $viewModel.draft.ausschlussMuster,
                    placeholder: "Regulärer Ausdruck",
                    monospaced: true,
                    invalid: { !StickerProfileEditorViewModel.isValidRegex($0) }
                )
            } header: {
                Text("Ausschlussmuster")
            } footer: {
                Text("Zeilen, die auf ein Ausschlussmuster passen (z. B. Modellbezeichnungen, Kabellängen), werden vor der Erkennung verworfen.")
            }

            Section {
                ForEach(viewModel.samples) { sample in
                    sampleRow(sample)
                }
                Button {
                    showSourceChoice = true
                } label: {
                    Label("Beispielbild hinzufügen", systemImage: "camera")
                }
            } header: {
                Text("Beispielbilder & Kalibrierung")
            } footer: {
                Text("Beispielbilder werden nur auf diesem Gerät gespeichert und dienen zum Testen der Erkennungsmuster.")
            }
        }
        .navigationTitle(viewModel.isNew ? "Neues Profil" : viewModel.draft.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Abbrechen") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Speichern") {
                    viewModel.save()
                    dismiss()
                }
                .disabled(!viewModel.isValid)
            }
        }
        .errorAlert($viewModel.errorMessage)
        .confirmationDialog("Beispielbild hinzufügen", isPresented: $showSourceChoice, titleVisibility: .visible) {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button("Foto aufnehmen") { showCamera = true }
            }
            Button("Aus Mediathek wählen") {
                photosPickerItem = nil
                showPhotoPicker = true
            }
            Button("Abbrechen", role: .cancel) {}
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photosPickerItem, matching: .images)
        .onChange(of: photosPickerItem) { _, newValue in
            guard let newValue else { return }
            Task {
                if let data = try? await newValue.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    await viewModel.addSample(image)
                }
                photosPickerItem = nil
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraCaptureView { image in
                showCamera = false
                if let image {
                    Task { await viewModel.addSample(image) }
                }
            }
            .ignoresSafeArea()
        }
    }

    @ViewBuilder
    private func sampleRow(_ sample: StickerProfileEditorViewModel.SampleResult) -> some View {
        HStack(alignment: .top, spacing: 12) {
            if let image = sample.image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            VStack(alignment: .leading, spacing: 4) {
                if sample.isRecognizing {
                    ProgressView("Erkenne Text …")
                } else {
                    let candidates = viewModel.candidates(for: sample)
                    if candidates.isEmpty {
                        Label("Keine Nummer erkannt", systemImage: "xmark.circle")
                            .font(.caption)
                            .foregroundStyle(.red)
                    } else {
                        Label(candidates.joined(separator: " / "), systemImage: "checkmark.circle")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                    if !sample.recognizedLines.isEmpty {
                        Text(sample.recognizedLines.joined(separator: " · "))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
            }
            Spacer()
            Button(role: .destructive) {
                viewModel.removeSample(sample.filename)
            } label: {
                Image(systemName: "trash")
            }
            .buttonStyle(.plain)
        }
    }
}

#Preview {
    NavigationStack { StickerProfileEditorView(profile: .ejbStandard) }
}
