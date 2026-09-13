import SwiftUI
import PhotosUI

/// "Rückgabe erfassen" sheet — per item: include-in-this-return checkbox, new status, optional
/// Zustandsfoto. Matches the reference frontend's `LoanReturnModal`.
struct LoanReturnView: View {
    let loan: Loan
    let viewModel: LoanDetailViewModel
    var onDone: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var included: Set<String> = []
    @State private var statusByItem: [String: InventoryStatus] = [:]
    @State private var photosByItem: [String: PhotosPickerItem] = [:]
    @State private var notes = ""
    @State private var isProcessing = false

    private var pendingItems: [LoanItem] { loan.items.filter { $0.returnedAt == nil } }

    var body: some View {
        NavigationStack {
            Form {
                ForEach(pendingItems) { item in
                    Section(item.inventoryItem.displayNumber) {
                        Toggle("Wird zurückgegeben", isOn: Binding(
                            get: { included.contains(item.id) },
                            set: { isOn in if isOn { included.insert(item.id) } else { included.remove(item.id) } }
                        ))
                        if included.contains(item.id) {
                            Picker("Neuer Status", selection: Binding(
                                get: { statusByItem[item.id] ?? .available },
                                set: { statusByItem[item.id] = $0 }
                            )) {
                                Text(InventoryStatus.available.label).tag(InventoryStatus.available)
                                Text(InventoryStatus.maintenance.label).tag(InventoryStatus.maintenance)
                                Text(InventoryStatus.defect.label).tag(InventoryStatus.defect)
                            }
                            PhotosPicker(selection: Binding(
                                get: { photosByItem[item.id] },
                                set: { photosByItem[item.id] = $0 }
                            ), matching: .images) {
                                Label(photosByItem[item.id] == nil ? "Zustandsfoto hinzufügen" : "Foto ausgewählt", systemImage: "camera")
                            }
                        }
                    }
                }
                Section("Notizen") {
                    TextEditor(text: $notes).frame(minHeight: 60)
                }
            }
            .navigationTitle("Rückgabe erfassen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if isProcessing {
                        ProgressView()
                    } else {
                        Button("Rückgabe erfassen") { Task { await confirm() } }
                            .disabled(included.isEmpty)
                    }
                }
            }
            .onAppear {
                included = Set(pendingItems.map(\.id))
                for item in pendingItems { statusByItem[item.id] = .available }
            }
        }
    }

    private func confirm() async {
        isProcessing = true
        defer { isProcessing = false }
        for (loanItemId, photo) in photosByItem where included.contains(loanItemId) {
            if let data = try? await photo.loadTransferable(type: Data.self) {
                await viewModel.uploadConditionPhoto(loanItemId: loanItemId, category: .returnPhoto, fileName: "zustand.jpg", mimeType: "image/jpeg", data: data)
            }
        }
        let items = included.map { ReturnLoanItemInput(loanItemId: $0, newStatus: statusByItem[$0]) }
        await viewModel.returnItems(items, notes: notes.isEmpty ? nil : notes)
        onDone()
    }
}
