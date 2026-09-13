import SwiftUI

/// The Organisationen list — tier 1 of the "two-tier owner" model. Tapping a row pushes to its
/// Untereinheiten (tier 2, see `OrganizationUnitsListView`); both screens share one
/// `OrganizationsViewModel` instance so a create/edit/delete made on either is immediately
/// reflected on both without a second fetch.
struct OrganizationsListView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = OrganizationsViewModel()
    @State private var showCreate = false
    @State private var editingOrganization: Organization?
    @State private var deletingOrganization: Organization?

    private var canCreate: Bool { session.hasPermission("organizations.create") }
    private var canUpdate: Bool { session.hasPermission("organizations.update") }
    private var canDelete: Bool { session.hasPermission("organizations.delete") }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Organisationen")
                .toolbar {
                    if canCreate {
                        ToolbarItem(placement: .primaryAction) {
                            Button {
                                showCreate = true
                            } label: {
                                Image(systemName: "plus")
                            }
                            .accessibilityIdentifier("organizations.addButton")
                        }
                    }
                }
                .task { await viewModel.load() }
                .errorAlert($viewModel.errorMessage)
                .sheet(isPresented: $showCreate) {
                    OrganizationNameFormSheet(title: "Neue Organisation") { name in
                        let success = await viewModel.createOrganization(name: name)
                        return success ? nil : (viewModel.consumeErrorMessage() ?? "Organisation konnte nicht angelegt werden.")
                    }
                }
                .sheet(item: $editingOrganization) { organization in
                    OrganizationNameFormSheet(title: "Organisation bearbeiten", initialName: organization.name) { name in
                        let success = await viewModel.updateOrganization(id: organization.id, name: name)
                        return success ? nil : (viewModel.consumeErrorMessage() ?? "Organisation konnte nicht gespeichert werden.")
                    }
                }
                .confirmationDialog(
                    "Organisation „\(deletingOrganization?.name ?? "")“ endgültig löschen? Ihre Untereinheiten sind danach nicht mehr erreichbar. Dies kann nicht rückgängig gemacht werden.",
                    isPresented: Binding(
                        get: { deletingOrganization != nil },
                        set: { isPresented in if !isPresented { deletingOrganization = nil } }
                    ),
                    titleVisibility: .visible
                ) {
                    Button("Endgültig löschen", role: .destructive) {
                        if let id = deletingOrganization?.id {
                            Task { await viewModel.deleteOrganization(id: id) }
                        }
                    }
                    Button("Abbrechen", role: .cancel) {}
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.organizations.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if viewModel.organizations.isEmpty {
            ContentUnavailableView("Keine Organisationen gefunden", systemImage: "building.2")
        } else {
            List {
                ForEach(viewModel.organizations) { organization in
                    NavigationLink {
                        OrganizationUnitsListView(organizationId: organization.id, viewModel: viewModel)
                    } label: {
                        row(for: organization)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: canDelete) {
                        if canDelete {
                            Button("Löschen", role: .destructive) { deletingOrganization = organization }
                        }
                        if canUpdate {
                            Button("Bearbeiten") { editingOrganization = organization }
                                .tint(.blue)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.load() }
        }
    }

    private func row(for organization: Organization) -> some View {
        let unitCount = organization.units?.count ?? 0
        return VStack(alignment: .leading, spacing: 4) {
            Text(organization.name)
                .font(.body.weight(.medium))
            Text(unitCount == 1 ? "1 Untereinheit" : "\(unitCount) Untereinheiten")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

/// Shared create/edit sheet for both an Organisation and an Untereinheit — both are a single
/// required "Name" field, differing only in title, initial value, and the async save action.
/// `onSave` returns the German error message on failure (so it can be shown from right here,
/// the topmost screen while this sheet is up) or `nil` on success, in which case the sheet
/// dismisses itself.
struct OrganizationNameFormSheet: View {
    let title: String
    let onSave: (String) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(title: String, initialName: String = "", onSave: @escaping (String) async -> String?) {
        self.title = title
        self.onSave = onSave
        _name = State(initialValue: initialName)
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("organizations.nameField")
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
                        Button("Speichern") {
                            Task {
                                isSaving = true
                                let failure = await onSave(trimmedName)
                                isSaving = false
                                if let failure {
                                    errorMessage = failure
                                } else {
                                    dismiss()
                                }
                            }
                        }
                        .accessibilityIdentifier("organizations.saveButton")
                        .disabled(trimmedName.isEmpty || isSaving)
                    }
                }
            }
            .errorAlert($errorMessage)
        }
    }
}

#Preview {
    OrganizationsListView()
        .environment(AuthSession.shared)
}
