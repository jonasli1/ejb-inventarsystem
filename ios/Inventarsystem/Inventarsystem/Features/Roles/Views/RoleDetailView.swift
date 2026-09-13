import SwiftUI

/// A Rolle's detail screen: editable name/description (Bearbeiten/Speichern, matching
/// `InventoryDetailView`'s pattern) and a permission checklist grouped by `PermissionGroup` —
/// checking/unchecking a permission calls assign/removePermission immediately, no separate
/// save step, matching how the reference frontend's own badge/select permission editor behaves
/// (just laid out as a native grouped checklist here instead of a flat select + badge list).
struct RoleDetailView: View {
    @Environment(AuthSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: RoleDetailViewModel
    @State private var showDeleteConfirm = false

    init(role: Role) {
        _viewModel = State(initialValue: RoleDetailViewModel(role: role))
    }

    private var canUpdate: Bool { session.hasPermission("roles.update") }
    private var canDelete: Bool { session.hasPermission("roles.delete") }
    private var canAssign: Bool { session.hasPermission("permissions.assign") }
    private var isProtected: Bool { viewModel.role.name == protectedRoleName }

    var body: some View {
        List {
            Section {
                if viewModel.isEditing {
                    editForm
                } else {
                    readOnlyHeader
                }
            }

            ForEach(PermissionGroup.allCases, id: \.self) { group in
                let permissions = viewModel.permissions(in: group)
                if !permissions.isEmpty {
                    Section(group.rawValue) {
                        ForEach(permissions) { permission in
                            permissionRow(permission)
                        }
                    }
                }
            }

            if canDelete && !isProtected && !viewModel.isEditing {
                Section {
                    Button("Rolle löschen", role: .destructive) {
                        showDeleteConfirm = true
                    }
                    .accessibilityIdentifier("roles.detail.deleteButton")
                }
            }
        }
        .navigationTitle(viewModel.role.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canUpdate {
                ToolbarItem(placement: .primaryAction) {
                    if viewModel.isEditing {
                        Button("Speichern") {
                            Task { _ = await viewModel.saveEdits() }
                        }
                        .disabled(viewModel.isSaving || viewModel.editName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("roles.detail.saveButton")
                    } else {
                        Button("Bearbeiten") { viewModel.beginEditing() }
                            .accessibilityIdentifier("roles.detail.editButton")
                    }
                }
            }
        }
        .task { await viewModel.load() }
        .errorAlert($viewModel.errorMessage)
        .onChange(of: viewModel.isDeleted) { _, deleted in if deleted { dismiss() } }
        .confirmationDialog(
            "Rolle „\(viewModel.role.name)“ endgültig löschen? Sie wird allen zugewiesenen Personen entzogen und dies kann nicht rückgängig gemacht werden.",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Endgültig löschen", role: .destructive) { Task { await viewModel.delete() } }
            Button("Abbrechen", role: .cancel) {}
        }
    }

    private var readOnlyHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let description = viewModel.role.description, !description.isEmpty {
                Text(description).font(.subheadline).foregroundStyle(.secondary)
            } else {
                Text("Keine Beschreibung").font(.subheadline).foregroundStyle(.tertiary)
            }
            Text("\(viewModel.role.permissions.count) Berechtigungen")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    private var editForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Name", text: $viewModel.editName)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
                .accessibilityIdentifier("roles.detail.nameField")
            TextField("Beschreibung", text: $viewModel.editDescription)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("roles.detail.descriptionField")
            Button("Abbrechen") { viewModel.cancelEditing() }
                .font(.footnote)
        }
        .padding(.vertical, 4)
    }

    private func permissionRow(_ permission: Permission) -> some View {
        Toggle(isOn: Binding(
            get: { viewModel.isAssigned(permission) },
            set: { _ in Task { await viewModel.togglePermission(permission) } }
        )) {
            VStack(alignment: .leading, spacing: 2) {
                Text(permission.displayName ?? permission.key)
                if let description = permission.description, !description.isEmpty {
                    Text(description).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .disabled(!canAssign)
        .accessibilityIdentifier("roles.detail.permissionToggle.\(permission.key)")
    }
}
