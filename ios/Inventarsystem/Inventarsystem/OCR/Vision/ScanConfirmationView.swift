import SwiftUI

/// Shows the recognized inventory number(s) for confirmation/correction before they're written
/// into a search field. Required by design: recognition must never silently drive the search —
/// the user always sees and can edit the result first, and picks among candidates when OCR
/// found more than one plausible number.
struct ScanConfirmationView: View {
    let result: StickerExtractionResult
    var onConfirm: (String) -> Void
    var onCancel: () -> Void

    @State private var editedValue: String

    init(result: StickerExtractionResult, onConfirm: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.result = result
        self.onConfirm = onConfirm
        self.onCancel = onCancel
        _editedValue = State(initialValue: result.candidates.first ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                if result.candidates.count > 1 {
                    Section("Mehrere Nummern erkannt — bitte auswählen") {
                        Picker("Inventarnummer", selection: $editedValue) {
                            ForEach(result.candidates, id: \.self) { candidate in
                                Text(candidate).tag(candidate)
                            }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    }
                }
                Section("Inventarnummer") {
                    TextField("Inventarnummer", text: $editedValue)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }
                Section {
                    Text("Erkannt mit Profil „\(result.profile.name)“")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Erkannte Nummer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Übernehmen") { onConfirm(editedValue) }
                        .disabled(editedValue.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

#Preview {
    ScanConfirmationView(
        result: StickerExtractionResult(profile: .ejbStandard, candidates: ["EJB 0268", "EJB 0269"]),
        onConfirm: { _ in },
        onCancel: {}
    )
}
