import SwiftUI

/// Räume for one Standort — pushed from `LocationsListView`. Shares the parent's
/// `LocationsViewModel` instance (via `@Bindable`, since it's owned by the caller, not created
/// here) rather than fetching independently: `GET /locations` already returns each Standort's
/// Räume embedded, so reading `locationId` back out of the shared `locations` array keeps this
/// screen in sync after any create/update/delete without a second network round trip.
struct RoomsListView: View {
    @Bindable var viewModel: LocationsViewModel
    let locationId: String

    @Environment(AuthSession.self) private var session
    @State private var showCreate = false
    @State private var editingRoom: Room?
    @State private var pendingDeleteRoom: Room?

    private var canCreate: Bool { session.hasPermission("locations.create") }
    private var canUpdate: Bool { session.hasPermission("locations.update") }
    private var canDelete: Bool { session.hasPermission("locations.delete") }

    private var location: Location? { viewModel.location(id: locationId) }
    private var rooms: [Room] { location?.rooms ?? [] }

    var body: some View {
        content
            .navigationTitle(location?.name ?? "Räume")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if canCreate {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showCreate = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityIdentifier("locations.addRoomButton")
                    }
                }
            }
            .sheet(isPresented: $showCreate) {
                RoomFormView(viewModel: viewModel, locationId: locationId, mode: .create)
            }
            .sheet(item: $editingRoom) { room in
                RoomFormView(viewModel: viewModel, locationId: locationId, mode: .edit(room))
            }
            .confirmationDialog(
                "Raum „\(pendingDeleteRoom?.name ?? "")“ endgültig löschen? Dies kann nicht rückgängig gemacht werden.",
                isPresented: Binding(
                    get: { pendingDeleteRoom != nil },
                    set: { isPresented in if !isPresented { pendingDeleteRoom = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Endgültig löschen", role: .destructive) {
                    guard let id = pendingDeleteRoom?.id else { return }
                    Task { await viewModel.deleteRoom(id: id) }
                }
                Button("Abbrechen", role: .cancel) {}
            }
            .errorAlert($viewModel.errorMessage)
    }

    @ViewBuilder
    private var content: some View {
        if location == nil {
            ContentUnavailableView("Standort nicht gefunden", systemImage: "questionmark.folder")
        } else if rooms.isEmpty {
            ContentUnavailableView("Keine Räume gefunden", systemImage: "door.left.hand.closed")
        } else {
            List {
                ForEach(rooms) { room in
                    Text(room.name)
                        .padding(.vertical, 2)
                        .swipeActions(edge: .trailing) {
                            if canDelete {
                                Button("Löschen", role: .destructive) {
                                    pendingDeleteRoom = room
                                }
                                .accessibilityIdentifier("locations.deleteRoomButton")
                            }
                            if canUpdate {
                                Button("Bearbeiten") {
                                    editingRoom = room
                                }
                                .tint(.blue)
                                .accessibilityIdentifier("locations.editRoomButton")
                            }
                        }
                }
            }
            .listStyle(.plain)
        }
    }
}

/// Create/edit sheet for a Raum — just Name. Same success/error-claiming pattern as
/// `LocationFormView` (see its doc comment): dismisses only on success, otherwise pulls the
/// message out of `viewModel.errorMessage` into a local one so it reliably shows on the sheet.
private struct RoomFormView: View {
    enum Mode {
        case create
        case edit(Room)
    }

    let viewModel: LocationsViewModel
    let locationId: String
    let mode: Mode

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(viewModel: LocationsViewModel, locationId: String, mode: Mode) {
        self.viewModel = viewModel
        self.locationId = locationId
        self.mode = mode
        switch mode {
        case .create:
            _name = State(initialValue: "")
        case .edit(let room):
            _name = State(initialValue: room.name)
        }
    }

    private var title: String {
        switch mode {
        case .create: return "Neuer Raum"
        case .edit: return "Raum bearbeiten"
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
                        .accessibilityIdentifier("locations.roomNameField")
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
                            .accessibilityIdentifier("locations.saveRoomButton")
                    }
                }
            }
            .errorAlert($errorMessage)
        }
    }

    private func save() async {
        isSaving = true
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let success: Bool
        switch mode {
        case .create:
            success = await viewModel.createRoom(locationId: locationId, name: trimmedName)
        case .edit(let room):
            success = await viewModel.updateRoom(id: room.id, name: trimmedName)
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
    NavigationStack {
        RoomsListView(viewModel: LocationsViewModel(), locationId: "preview")
    }
    .environment(AuthSession.shared)
}
