import SwiftUI

/// The Gruppen list — Gruppen come from two sources (synced automatically from ChurchTools on
/// login, or created manually by an admin) and are shown together here, distinguished by a small
/// source tag on each row. Tapping a row pushes to `GroupDetailView`. Deliberately a plain
/// `NavigationStack` + `NavigationLink` push (no programmatic navigation needed, unlike the
/// Inventory feature's scan-driven flows), matching `LocationsListView`'s simpler shape.
struct GroupsListView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = GroupsListViewModel()
    @State private var showCreate = false

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Gruppen")
                .toolbar {
                    if session.hasPermission("groups.create") {
                        ToolbarItem(placement: .primaryAction) {
                            Button {
                                showCreate = true
                            } label: {
                                Image(systemName: "plus")
                            }
                            .accessibilityIdentifier("groups.addButton")
                        }
                    }
                }
                .sheet(isPresented: $showCreate) {
                    GroupCreateSheet(viewModel: viewModel)
                }
                .task { await viewModel.onAppear() }
        }
    }

    @ViewBuilder
    private var content: some View {
        let list = viewModel.groups
        if list.isLoading && list.items.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if list.items.isEmpty {
            ContentUnavailableView("Keine Gruppen gefunden", systemImage: "person.3")
        } else {
            List {
                ForEach(list.items) { group in
                    NavigationLink {
                        GroupDetailView(group: group)
                    } label: {
                        GroupRowView(group: group)
                    }
                    .accessibilityIdentifier("groups.row.\(group.id)")
                }
                if list.totalPages > 1 {
                    HStack {
                        Button("Zurück") { Task { await list.loadPreviousPage() } }
                            .disabled(!list.hasPreviousPage)
                        Spacer()
                        Text("Seite \(list.page) von \(list.totalPages)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Weiter") { Task { await list.loadNextPage() } }
                            .disabled(!list.hasNextPage)
                    }
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.refresh() }
        }
    }
}

/// A single Gruppe row — name (plus description, if any) and a small tag showing whether it's
/// synced from ChurchTools or created manually in the app.
private struct GroupRowView: View {
    let group: AppGroup

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(group.name)
                    .font(.body.weight(.medium))
                if let description = group.description, !description.isEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
            GroupSourceBadge(isFromChurchTools: group.isFromChurchTools)
        }
        .padding(.vertical, 2)
    }
}

/// Small source tag — "ChurchTools" for a group synced automatically on login, "Manuell" for one
/// created directly in the app. Shown in both the list row and the detail screen (where it also
/// explains why the identity fields are locked for a synced group). Styled after `StatusBadge`.
struct GroupSourceBadge: View {
    let isFromChurchTools: Bool

    private var badgeColor: Color { isFromChurchTools ? .blue : .gray }

    var body: some View {
        Text(isFromChurchTools ? "ChurchTools" : "Manuell")
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(badgeColor.opacity(0.15))
            .foregroundStyle(badgeColor)
            .clipShape(Capsule())
    }
}

/// The "Neue Gruppe" create sheet — Name + Beschreibung only, relevant solely to manually-created
/// groups (ChurchTools-synced ones are created by the sync process, never by hand here). Calls
/// straight into the shared `GroupsListViewModel` and only dismisses on success; on failure it
/// claims the error out of `viewModel.errorMessage` into a local `errorMessage` so it displays
/// reliably on the sheet itself, matching `LocationFormView`'s exact pattern.
private struct GroupCreateSheet: View {
    let viewModel: GroupsListViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Gruppe") {
                    TextField("Name", text: $name)
                        .accessibilityIdentifier("groups.createNameField")
                    TextField("Beschreibung", text: $description)
                        .accessibilityIdentifier("groups.createDescriptionField")
                }
            }
            .navigationTitle("Neue Gruppe")
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
                            .accessibilityIdentifier("groups.createSaveButton")
                    }
                }
            }
            .errorAlert($errorMessage)
        }
    }

    private func save() async {
        isSaving = true
        let success = await viewModel.createGroup(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            description: description.trimmingCharacters(in: .whitespacesAndNewlines)
        )
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
    GroupsListView()
        .environment(AuthSession.shared)
}
