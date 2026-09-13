import SwiftUI
import PhotosUI

/// "Ausgeben" sheet — optional per-item Zustandsfotos (condition photos), then confirms issue.
/// Photos are a nice-to-have, not a blocker: the backend's `/issue` call itself takes no photo
/// data, so upload failures here don't prevent the actual handover from being recorded.
struct LoanIssueView: View {
    let loan: Loan
    let viewModel: LoanDetailViewModel
    var onDone: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var photosByItem: [String: PhotosPickerItem] = [:]
    @State private var isProcessing = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Beim Ausgeben können optional Zustandsfotos je Objekt hinterlegt werden.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                ForEach(loan.items) { item in
                    Section(item.inventoryItem.displayNumber) {
                        PhotosPicker(selection: Binding(
                            get: { photosByItem[item.id] },
                            set: { photosByItem[item.id] = $0 }
                        ), matching: .images) {
                            Label(photosByItem[item.id] == nil ? "Zustandsfoto hinzufügen" : "Foto ausgewählt", systemImage: "camera")
                        }
                    }
                }
            }
            .navigationTitle("Ausgeben")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if isProcessing {
                        ProgressView()
                    } else {
                        Button("Ausgeben") { Task { await confirm() } }
                    }
                }
            }
        }
    }

    private func confirm() async {
        isProcessing = true
        defer { isProcessing = false }
        for (loanItemId, photo) in photosByItem {
            if let data = try? await photo.loadTransferable(type: Data.self) {
                await viewModel.uploadConditionPhoto(loanItemId: loanItemId, category: .checkoutPhoto, fileName: "zustand.jpg", mimeType: "image/jpeg", data: data)
            }
        }
        await viewModel.issue()
        onDone()
    }
}
