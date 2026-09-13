import SwiftUI

/// The Standorte list — top-level entry point for the Standorte/Räume feature. Tapping a row
/// pushes to `RoomsListView` for that Standort. Deliberately a plain `NavigationStack` +
/// `NavigationLink` push (no `NavigationSplitView`) since the app's outer navigation shell isn't
/// built yet — this feature stays self-contained.
struct LocationsListView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = LocationsViewModel()
    @State private var showCreate = false
    @State private var editingLocation: Location?
    @State private var pendingDeleteLocation: Location?

    private var canCreate: Bool { session.hasPermission("locations.create") }
    private var canUpdate: Bool { session.hasPermission("locations.update") }
    private var canDelete: Bool { session.hasPermission("locations.delete") }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Standorte")
                .toolbar {
                    if canCreate {
                        ToolbarItem(placement: .primaryAction) {
                            Button {
                                showCreate = true
                            } label: {
                                Image(systemName: "plus")
                            }
                            .accessibilityIdentifier("locations.addButton")
                        }
                    }
                }
                .sheet(isPresented: $showCreate) {
                    LocationFormView(viewModel: viewModel, mode: .create)
                }
                .sheet(item: $editingLocation) { location in
                    LocationFormView(viewModel: viewModel, mode: .edit(location))
                }
                .confirmationDialog(
                    "Standort „\(pendingDeleteLocation?.name ?? "")“ endgültig löschen? Dies kann nicht rückgängig gemacht werden.",
                    isPresented: Binding(
                        get: { pendingDeleteLocation != nil },
                        set: { isPresented in if !isPresented { pendingDeleteLocation = nil } }
                    ),
                    titleVisibility: .visible
                ) {
                    Button("Endgültig löschen", role: .destructive) {
                        guard let id = pendingDeleteLocation?.id else { return }
                        Task { await viewModel.deleteLocation(id: id) }
                    }
                    Button("Abbrechen", role: .cancel) {}
                }
                .task { await viewModel.load() }
                .errorAlert($viewModel.errorMessage)
        }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.locations.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if viewModel.locations.isEmpty {
            ContentUnavailableView("Keine Standorte gefunden", systemImage: "mappin.and.ellipse")
        } else {
            List {
                ForEach(viewModel.locations) { location in
                    NavigationLink {
                        RoomsListView(viewModel: viewModel, locationId: location.id)
                    } label: {
                        LocationRow(location: location)
                    }
                    .swipeActions(edge: .trailing) {
                        if canDelete {
                            Button("Löschen", role: .destructive) {
                                pendingDeleteLocation = location
                            }
                            .accessibilityIdentifier("locations.deleteButton")
                        }
                        if canUpdate {
                            Button("Bearbeiten") {
                                editingLocation = location
                            }
                            .tint(.blue)
                            .accessibilityIdentifier("locations.editButton")
                        }
                    }
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.load() }
        }
    }
}

/// A single Standort row: name, address, and its Räume count.
private struct LocationRow: View {
    let location: Location

    private var roomCountLabel: String {
        switch location.rooms?.count ?? 0 {
        case 0: return "Keine Räume"
        case 1: return "1 Raum"
        case let count: return "\(count) Räume"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(location.name)
                .font(.body.weight(.medium))
            if let address = location.address, !address.isEmpty {
                Text(address)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Text(roomCountLabel)
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 2)
    }
}

/// Create/edit sheet for a Standort — Name + Adresse. Calls straight into the shared
/// `LocationsViewModel` (no dedicated create view model — the form is too small to warrant one)
/// and only dismisses on success; on failure it claims the error out of `viewModel.errorMessage`
/// into a local `errorMessage` so it displays reliably on the sheet itself (the active
/// presentation) rather than racing the list view's own `.errorAlert` underneath it.
private struct LocationFormView: View {
    enum Mode {
        case create
        case edit(Location)
    }

    let viewModel: LocationsViewModel
    let mode: Mode

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var address: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(viewModel: LocationsViewModel, mode: Mode) {
        self.viewModel = viewModel
        self.mode = mode
        switch mode {
        case .create:
            _name = State(initialValue: "")
            _address = State(initialValue: "")
        case .edit(let location):
            _name = State(initialValue: location.name)
            _address = State(initialValue: location.address ?? "")
        }
    }

    private var title: String {
        switch mode {
        case .create: return "Neuer Standort"
        case .edit: return "Standort bearbeiten"
        }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                        .accessibilityIdentifier("locations.nameField")
                    TextField("Adresse", text: $address)
                        .accessibilityIdentifier("locations.addressField")
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Speichern") { Task { await save() } }
                            .disabled(!canSave)
                            .accessibilityIdentifier("locations.saveButton")
                    }
                }
            }
            .errorAlert($errorMessage)
        }
    }

    private func save() async {
        isSaving = true
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedAddress = address.trimmingCharacters(in: .whitespacesAndNewlines)
        let success: Bool
        switch mode {
        case .create:
            success = await viewModel.createLocation(name: trimmedName, address: trimmedAddress)
        case .edit(let location):
            success = await viewModel.updateLocation(id: location.id, name: trimmedName, address: trimmedAddress)
        }
        isSaving = false
        if success {
            dismiss()
        } else {
            errorMessage = viewModel.errorMessage
            viewModel.errorMessage = nil
        }
    }
}

#Preview {
    LocationsListView()
        .environment(AuthSession.shared)
}
