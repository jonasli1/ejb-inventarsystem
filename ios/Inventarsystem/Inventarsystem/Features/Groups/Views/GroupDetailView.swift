import SwiftUI

/// The Gruppe detail screen: identity (editable only for a manually created group), assigned
/// Rollen, and Organisations-Zuordnung. A ChurchTools-synced group's name/description are shown
/// read-only — its own identity is managed by the sync process, not by hand here — but its
/// Rollen and Organisations-Zuordnung remain editable regardless of source.
struct GroupDetailView: View {
    let group: AppGroup

    @Environment(AuthSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: GroupDetailViewModel
    @State private var showDeleteConfirm = false
    @State private var showAssignRole = false
    @State private var showAddScope = false

    init(group: AppGroup) {
        self.group = group
        _viewModel = State(initialValue: GroupDetailViewModel(group: group))
    }

    private var canUpdate: Bool { session.hasPermission("groups.update") }
    private var canDelete: Bool { session.hasPermission("groups.delete") && !viewModel.group.isFromChurchTools }
    private var canEditIdentity: Bool { canUpdate && !viewModel.group.isFromChurchTools }

    private var descriptionDisplay: String {
        let text = viewModel.group.description ?? ""
        return text.isEmpty ? "—" : text
    }

    var body: some View {
        List {
            identitySection
            rolesSection
            organizationScopeSection
            if canDelete {
                deleteSection
            }
        }
        .navigationTitle(viewModel.group.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEditIdentity {
                if viewModel.isEditing {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Abbrechen") { viewModel.cancelEditing() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        if viewModel.isSaving {
                            ProgressView()
                        } else {
                            Button("Speichern") {
                                Task { _ = await viewModel.saveEdits() }
                            }
                            .disabled(viewModel.editName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            .accessibilityIdentifier("groups.saveButton")
                        }
                    }
                } else {
                    ToolbarItem(placement: .primaryAction) {
                        Button("Bearbeiten") { viewModel.beginEditing() }
                            .accessibilityIdentifier("groups.editButton")
                    }
                }
            }
        }
        .task { await viewModel.load() }
        .errorAlert($viewModel.errorMessage)
        .onChange(of: viewModel.isDeleted) { _, deleted in if deleted { dismiss() } }
    }

    // MARK: - Gruppe

    @ViewBuilder
    private var identitySection: some View {
        Section("Gruppe") {
            if viewModel.isEditing {
                TextField("Name", text: $viewModel.editName)
                    .accessibilityIdentifier("groups.nameField")
                TextField("Beschreibung", text: $viewModel.editDescription)
                    .accessibilityIdentifier("groups.descriptionField")
            } else {
                LabeledContent("Name", value: viewModel.group.name)
                LabeledContent("Beschreibung", value: descriptionDisplay)
            }
            LabeledContent("Quelle") {
                GroupSourceBadge(isFromChurchTools: viewModel.group.isFromChurchTools)
            }
        }
    }

    // MARK: - Rollen

    @ViewBuilder
    private var rolesSection: some View {
        Section("Rollen") {
            if viewModel.isLoading && viewModel.roles.isEmpty {
                ProgressView()
            } else if viewModel.roles.isEmpty {
                Text("Keine Rollen zugewiesen.")
                    .foregroundStyle(.secondary)
                    .font(.footnote)
            } else {
                ForEach(viewModel.roles) { role in
                    Text(role.name)
                        .swipeActions {
                            if canUpdate {
                                Button("Entfernen", role: .destructive) {
                                    Task { await viewModel.removeRole(role.id) }
                                }
                            }
                        }
                }
            }
            if canUpdate {
                Button {
                    showAssignRole = true
                } label: {
                    Label("Rolle hinzufügen", systemImage: "plus")
                }
                .accessibilityIdentifier("groups.addRoleButton")
            }
        }
        .sheet(isPresented: $showAssignRole) {
            AssignRoleSheet(viewModel: viewModel)
        }
    }

    // MARK: - Organisations-Zuordnung

    @ViewBuilder
    private var organizationScopeSection: some View {
        Section("Organisations-Zuordnung") {
            if viewModel.isLoading && viewModel.organizationScopes.isEmpty {
                ProgressView()
            } else if viewModel.organizationScopes.isEmpty {
                Text("Keine Organisationen zugeordnet.")
                    .foregroundStyle(.secondary)
                    .font(.footnote)
            } else {
                ForEach(viewModel.organizationScopes) { scope in
                    Text(scopeLabel(scope))
                        .swipeActions {
                            if canUpdate {
                                Button("Entfernen", role: .destructive) {
                                    Task { await viewModel.removeOrganizationScope(scope.id) }
                                }
                            }
                        }
                }
            }
            if canUpdate {
                Button {
                    showAddScope = true
                } label: {
                    Label("Organisation zuordnen", systemImage: "plus")
                }
                .accessibilityIdentifier("groups.addScopeButton")
            }
        }
        .sheet(isPresented: $showAddScope) {
            AddOrganizationScopeSheet(viewModel: viewModel)
        }
    }

    private func scopeLabel(_ scope: GroupOrganizationScope) -> String {
        guard let unit = scope.organizationUnit else { return scope.organization.name }
        return "\(scope.organization.name) · \(unit.name)"
    }

    // MARK: - Löschen

    @ViewBuilder
    private var deleteSection: some View {
        Section {
            Button("Gruppe löschen", role: .destructive) {
                showDeleteConfirm = true
            }
            .accessibilityIdentifier("groups.deleteButton")
        }
        .confirmationDialog(
            "Gruppe „\(viewModel.group.name)“ endgültig löschen? Dies kann nicht rückgängig gemacht werden.",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Endgültig löschen", role: .destructive) { Task { await viewModel.delete() } }
            Button("Abbrechen", role: .cancel) {}
        }
    }
}

/// "Rolle hinzufügen" — a plain list of not-yet-assigned Rollen (the full roster is small and
/// unpaginated, unlike the Inventory feature's server-searched pickers, so no search field is
/// needed). Tapping a row dismisses immediately and fires the assignment in the background,
/// matching `InventoryDetailView`'s accessory-picker: any failure surfaces via the detail
/// screen's own `.errorAlert` once the sheet is already gone, so there's no alert-behind-sheet race.
private struct AssignRoleSheet: View {
    let viewModel: GroupDetailViewModel

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.assignableRoles.isEmpty {
                    ContentUnavailableView("Keine weiteren Rollen verfügbar", systemImage: "person.badge.key")
                } else {
                    List(viewModel.assignableRoles) { role in
                        Button {
                            dismiss()
                            Task { await viewModel.assignRole(role.id) }
                        } label: {
                            HStack {
                                Text(role.name).foregroundStyle(.primary)
                                Spacer()
                                Image(systemName: "plus.circle").foregroundStyle(.blue)
                            }
                        }
                        .accessibilityIdentifier("groups.roleOption.\(role.id)")
                    }
                }
            }
            .navigationTitle("Rolle hinzufügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
            }
        }
    }
}

/// "Organisation zuordnen" — the two-step picker: pick an Organisation, then optionally one of
/// its Untereinheiten or "ganze Organisation". Implemented as a single view swapping its content
/// via local `@State` (rather than an actual `NavigationLink` push) so `@Environment(\.dismiss)`
/// reliably closes the whole sheet from either step — a push would instead just pop back to the
/// first step, since `dismiss` acts on the nearest enclosing presentation.
private struct AddOrganizationScopeSheet: View {
    let viewModel: GroupDetailViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var selectedOrganization: Organization?

    var body: some View {
        NavigationStack {
            Group {
                if let organization = selectedOrganization {
                    unitList(for: organization)
                } else {
                    organizationList
                }
            }
            .navigationTitle(selectedOrganization?.name ?? "Organisation zuordnen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if selectedOrganization != nil {
                        Button("Zurück") { selectedOrganization = nil }
                    } else {
                        Button("Abbrechen") { dismiss() }
                    }
                }
            }
        }
    }

    private var organizationList: some View {
        List(viewModel.allOrganizations) { organization in
            Button(organization.name) {
                selectedOrganization = organization
            }
            .accessibilityIdentifier("groups.organizationOption.\(organization.id)")
        }
    }

    @ViewBuilder
    private func unitList(for organization: Organization) -> some View {
        List {
            Button("ganze Organisation") {
                dismiss()
                Task { await viewModel.addOrganizationScope(organizationId: organization.id, organizationUnitId: nil) }
            }
            .accessibilityIdentifier("groups.wholeOrganizationOption")

            if let units = organization.units, !units.isEmpty {
                Section("Untereinheiten") {
                    ForEach(units) { unit in
                        Button(unit.name) {
                            dismiss()
                            Task { await viewModel.addOrganizationScope(organizationId: organization.id, organizationUnitId: unit.id) }
                        }
                        .accessibilityIdentifier("groups.unitOption.\(unit.id)")
                    }
                }
            }
        }
    }
}
