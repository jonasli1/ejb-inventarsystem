import SwiftUI

struct InventoryCreateView: View {
    var onCreated: (InventoryItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = InventoryCreateViewModel()
    @State private var showArticlePicker = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Artikel") {
                    Button {
                        showArticlePicker = true
                    } label: {
                        HStack {
                            Text(viewModel.selectedArticle?.article.name ?? "Artikel auswählen")
                                .foregroundStyle(viewModel.selectedArticle == nil ? .secondary : .primary)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(.tertiary).font(.caption)
                        }
                    }
                }

                Section("Standort") {
                    Picker("Standort", selection: Binding(
                        get: { viewModel.selectedLocationId },
                        set: { newValue in if let newValue { viewModel.selectLocation(newValue) } }
                    )) {
                        Text("Bitte wählen").tag(String?.none)
                        ForEach(viewModel.locations) { location in
                            Text(location.name).tag(String?.some(location.id))
                        }
                    }
                    Picker("Raum", selection: $viewModel.selectedRoomId) {
                        Text("Bitte wählen").tag(String?.none)
                        ForEach(viewModel.availableRooms) { room in
                            Text(room.name).tag(String?.some(room.id))
                        }
                    }
                    .disabled(viewModel.selectedLocationId == nil)
                }

                Section("Eigentümer") {
                    Picker("Organisation", selection: Binding(
                        get: { viewModel.selectedOrganizationId },
                        set: { newValue in if let newValue { viewModel.selectOrganization(newValue) } }
                    )) {
                        Text("Bitte wählen").tag(String?.none)
                        ForEach(viewModel.organizations) { organization in
                            Text(organization.name).tag(String?.some(organization.id))
                        }
                    }
                    Picker("Untereinheit", selection: $viewModel.selectedUnitId) {
                        Text("Bitte wählen").tag(String?.none)
                        ForEach(viewModel.availableUnits) { unit in
                            Text(unit.name).tag(String?.some(unit.id))
                        }
                    }
                    .disabled(viewModel.selectedOrganizationId == nil)
                }

                Section("Details (optional)") {
                    TextField("Inventarnummer", text: $viewModel.inventoryNumber)
                        .autocorrectionDisabled()
                    TextField("Seriennummer", text: $viewModel.serialNumber)
                        .autocorrectionDisabled()
                    HStack {
                        Text("Anschaffungspreis (€)")
                        Spacer()
                        TextField("0,00", text: $viewModel.purchasePriceText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 120)
                    }
                    OptionalDatePicker(title: "Anschaffungsdatum", date: $viewModel.purchaseDate)
                    OptionalDatePicker(title: "Nächste DGUV-V3-Prüfung", date: $viewModel.nextDguvV3Check)
                }

                Section("Notizen") {
                    TextEditor(text: $viewModel.notes)
                        .frame(minHeight: 80)
                }
            }
            .navigationTitle("Neues Inventarobjekt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSaving {
                        ProgressView()
                    } else {
                        Button("Speichern") {
                            Task {
                                if let created = await viewModel.save() {
                                    onCreated(created)
                                }
                            }
                        }
                        .disabled(!viewModel.canSave)
                    }
                }
            }
            .errorAlert($viewModel.errorMessage)
            .sheet(isPresented: $showArticlePicker) {
                NavigationStack {
                    AsyncSearchPicker<ArticleListItem>(
                        placeholder: "Artikel suchen",
                        search: { query in await viewModel.articleSearch(query) },
                        onSelect: { article in
                            viewModel.selectedArticle = article
                            showArticlePicker = false
                        }
                    )
                    .navigationTitle("Artikel auswählen")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Abbrechen") { showArticlePicker = false }
                        }
                    }
                }
            }
            .task { await viewModel.loadPickerData() }
        }
    }
}
