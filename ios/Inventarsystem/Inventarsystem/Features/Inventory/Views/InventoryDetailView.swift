import SwiftUI

struct InventoryDetailView: View {
    let itemId: String

    @Environment(AuthSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: InventoryDetailViewModel
    @State private var tab: Tab = .overview
    @State private var showDeleteConfirm = false
    @State private var showDecommissionConfirm = false
    @State private var showAccessoryPicker = false
    @State private var addAccessorySeparatelyLoanable = false

    private enum Tab: String, CaseIterable { case overview = "Übersicht", documents = "Dokumente", accessories = "Zubehör" }

    init(itemId: String) {
        self.itemId = itemId
        _viewModel = State(initialValue: InventoryDetailViewModel(itemId: itemId))
    }

    private var canUpdate: Bool { session.hasPermission("inventory.update") }
    private var canChangeInventoryNumber: Bool { session.hasPermission("inventory.change_inventory_number") }
    private var canRetire: Bool { session.hasPermission("inventory.retire") }
    private var canDelete: Bool { session.hasPermission("inventory.delete") }

    var body: some View {
        Group {
            if let item = viewModel.item {
                content(for: item)
            } else if viewModel.isLoading {
                ProgressView()
            } else {
                ContentUnavailableView("Objekt nicht gefunden", systemImage: "questionmark.folder")
            }
        }
        .navigationTitle(viewModel.item?.displayNumber ?? "Inventarobjekt")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.errorMessage)
        .onChange(of: viewModel.isDeleted) { _, deleted in if deleted { dismiss() } }
    }

    @ViewBuilder
    private func content(for item: InventoryItem) -> some View {
        VStack(spacing: 0) {
            if item.status == .maintenance {
                maintenanceBanner
            }

            Picker("Ansicht", selection: $tab) {
                ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding()

            ScrollView {
                switch tab {
                case .overview: overviewTab(item)
                case .documents: documentsTab
                case .accessories: accessoriesTab
                }
            }
        }
        .toolbar {
            if tab == .overview && canUpdate {
                ToolbarItem(placement: .primaryAction) {
                    if viewModel.isEditing {
                        Button("Fertig") {
                            Task { _ = await viewModel.saveEdits(canChangeInventoryNumber: canChangeInventoryNumber) }
                        }
                        .disabled(viewModel.isSaving)
                    } else {
                        Button("Bearbeiten") { Task { await viewModel.beginEditing() } }
                    }
                }
            }
        }
    }

    private var maintenanceBanner: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Dieses Objekt befindet sich in Wartung.", systemImage: "wrench.and.screwdriver.fill")
                .foregroundStyle(.orange)
            if canRetire {
                Button("Direkt ausmustern", role: .destructive) { showDecommissionConfirm = true }
                    .font(.footnote)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.orange.opacity(0.12))
        .confirmationDialog(
            "Objekt direkt ausmustern? Der Status wird auf „Ausgemustert“ gesetzt.",
            isPresented: $showDecommissionConfirm,
            titleVisibility: .visible
        ) {
            Button("Ausmustern", role: .destructive) { Task { await viewModel.decommission() } }
            Button("Abbrechen", role: .cancel) {}
        }
    }

    // MARK: - Übersicht

    @ViewBuilder
    private func overviewTab(_ item: InventoryItem) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            if viewModel.isEditing {
                editForm(item)
            } else {
                readOnlyOverview(item)
            }

            if let articleNotes = item.article.notes, !articleNotes.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Notizen vom Artikel", systemImage: "doc.text")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.blue)
                    Text(articleNotes).font(.subheadline)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(Color.blue.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            DisclosureGroup("Bewegungshistorie") {
                if viewModel.movements.isEmpty {
                    Text("Keine Bewegungen erfasst.").foregroundStyle(.secondary).font(.footnote)
                } else {
                    ForEach(viewModel.movements) { movement in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(movement.type.label).font(.subheadline.weight(.medium))
                            if let note = movement.note { Text(note).font(.footnote).foregroundStyle(.secondary) }
                            Text(movement.createdAt, style: .date).font(.caption).foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 4)
                        Divider()
                    }
                }
            }
            .task { await viewModel.loadMovementsIfNeeded() }

            if canDelete && !viewModel.isEditing {
                Button("Objekt löschen", role: .destructive) { showDeleteConfirm = true }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
            }
        }
        .padding()
        .confirmationDialog(
            "Objekt „\(item.displayNumber)“ endgültig löschen? Es verschwindet dauerhaft aus allen Ansichten und dies kann nicht rückgängig gemacht werden.",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Endgültig löschen", role: .destructive) { Task { await viewModel.delete() } }
            Button("Abbrechen", role: .cancel) {}
        }
    }

    private func readOnlyOverview(_ item: InventoryItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            LabeledContent("Artikel", value: item.article.name)
            LabeledContent("Status") { StatusBadge(status: item.status) }
            LabeledContent("Inventarnummer", value: item.inventoryNumber ?? "—")
            LabeledContent("Seriennummer", value: item.serialNumber ?? "—")
            LabeledContent("Standort", value: "\(item.location.name) · \(item.room.name)")
            LabeledContent("Eigentümer", value: "\(item.ownerOrganization.name) · \(item.ownerUnit.name)")
            if let price = item.purchasePrice {
                LabeledContent("Anschaffungspreis", value: price.formatted(.currency(code: "EUR")))
            }
            if let date = item.purchaseDate {
                LabeledContent("Anschaffungsdatum", value: date.formatted(date: .abbreviated, time: .omitted))
            }
            if let date = item.nextDguvV3Check {
                LabeledContent("Nächste DGUV-V3-Prüfung", value: date.formatted(date: .abbreviated, time: .omitted))
            }
            if let notes = item.notes, !notes.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Notizen").foregroundStyle(.secondary).font(.footnote)
                    Text(notes)
                }
            }
        }
    }

    @ViewBuilder
    private func editForm(_ item: InventoryItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            LabeledContent("Artikel", value: item.article.name)

            if canChangeInventoryNumber {
                TextField("Inventarnummer", text: $viewModel.editInventoryNumber)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
            } else {
                LabeledContent("Inventarnummer", value: item.inventoryNumber ?? "—")
                Text("Keine Berechtigung, die Inventarnummer zu ändern.")
                    .font(.caption).foregroundStyle(.secondary)
            }

            TextField("Seriennummer", text: $viewModel.editSerialNumber)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()

            if item.status == .borrowed {
                LabeledContent("Status") { StatusBadge(status: InventoryStatus.borrowed) }
                Text("Der Status wird über die Ausleihe verwaltet.").font(.caption).foregroundStyle(.secondary)
            } else {
                Picker("Status", selection: $viewModel.editStatus) {
                    ForEach(InventoryStatus.manuallyAssignable, id: \.self) { Text($0.label).tag($0) }
                    if canRetire { Text(InventoryStatus.retired.label).tag(InventoryStatus.retired) }
                }
            }

            Picker("Eigentümer-Organisation", selection: $viewModel.editOwnerOrganizationId) {
                ForEach(viewModel.organizations) { Text($0.name).tag($0.id) }
            }
            Picker("Eigentümer-Untereinheit", selection: $viewModel.editOwnerUnitId) {
                ForEach(viewModel.editAvailableUnits) { Text($0.name).tag($0.id) }
            }

            HStack {
                Text("Anschaffungspreis (€)")
                Spacer()
                TextField("0,00", text: $viewModel.editPurchasePriceText)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 120)
            }
            OptionalDatePicker(title: "Anschaffungsdatum", date: $viewModel.editPurchaseDate)
            OptionalDatePicker(title: "Nächste DGUV-V3-Prüfung", date: $viewModel.editNextDguvV3Check)

            VStack(alignment: .leading, spacing: 4) {
                Text("Notizen").font(.footnote).foregroundStyle(.secondary)
                TextEditor(text: $viewModel.editNotes).frame(minHeight: 80)
            }

            Button("Abbrechen") { viewModel.cancelEditing() }
                .font(.footnote)
        }
    }

    // MARK: - Dokumente

    private var documentsTab: some View {
        InventoryDocumentsTabView(viewModel: viewModel, canUpdate: canUpdate)
            .padding()
    }

    // MARK: - Zubehör

    @ViewBuilder
    private var accessoriesTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            if viewModel.accessories.isEmpty {
                Text("Kein Zubehör zugeordnet.").foregroundStyle(.secondary)
            } else {
                ForEach(viewModel.accessories) { accessory in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(accessory.displayNumber).font(.subheadline.weight(.medium))
                                Text(accessory.article.name).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if canUpdate {
                                Button(role: .destructive) {
                                    Task { await viewModel.removeAccessory(accessory.id) }
                                } label: {
                                    Image(systemName: "minus.circle")
                                }
                            }
                        }
                        Toggle(
                            "Einzeln ausleihbar",
                            isOn: Binding(
                                get: { accessory.separatelyLoanable },
                                set: { newValue in
                                    Task { await viewModel.setAccessorySeparatelyLoanable(accessory.id, separatelyLoanable: newValue) }
                                }
                            )
                        )
                        .font(.caption)
                        .disabled(!canUpdate)
                    }
                    Divider()
                }
            }

            if canUpdate {
                Toggle("Neues Zubehör kann auch einzeln ausgeliehen werden", isOn: $addAccessorySeparatelyLoanable)
                    .font(.caption)
                Button {
                    showAccessoryPicker = true
                } label: {
                    Label("Zubehör hinzufügen", systemImage: "plus")
                }
            }
        }
        .padding()
        .sheet(isPresented: $showAccessoryPicker) {
            NavigationStack {
                AsyncSearchPicker<AccessoryCandidate>(
                    placeholder: "Objekt suchen",
                    search: { query in await viewModel.accessoryCandidateSearch(query) },
                    onSelect: { candidate in
                        showAccessoryPicker = false
                        let separatelyLoanable = addAccessorySeparatelyLoanable
                        addAccessorySeparatelyLoanable = false
                        Task { await viewModel.assignAccessory(candidate.item.id, separatelyLoanable: separatelyLoanable) }
                    },
                    enableStickerScan: true
                )
                .navigationTitle("Zubehör auswählen")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Abbrechen") { showAccessoryPicker = false }
                    }
                }
            }
        }
    }
}
