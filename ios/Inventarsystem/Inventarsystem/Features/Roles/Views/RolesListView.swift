import SwiftUI

/// The Rollen list — role management plus a purely informational, collapsible panel explaining
/// every permission in the system, grouped exactly like the reference frontend's own "Was
/// bedeuten die Berechtigungen?" card (`PermissionsInfoCard` in `frontend/src/features/roles/RolesPage.tsx`).
struct RolesListView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = RolesListViewModel()
    @State private var showCreate = false
    @State private var showPermissionInfo = false

    private var canCreate: Bool { session.hasPermission("roles.create") }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    DisclosureGroup(isExpanded: $showPermissionInfo) {
                        permissionInfoContent
                    } label: {
                        Label("Was bedeuten die Berechtigungen?", systemImage: "info.circle")
                    }
                    .accessibilityIdentifier("roles.permissionInfoDisclosure")
                }

                Section {
                    if viewModel.roles.isEmpty && viewModel.isLoading {
                        ProgressView().frame(maxWidth: .infinity)
                    } else if viewModel.roles.isEmpty {
                        ContentUnavailableView("Keine Rollen vorhanden", systemImage: "person.badge.key")
                    } else {
                        ForEach(viewModel.roles) { role in
                            NavigationLink(value: role) {
                                RoleRowView(role: role)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Rollen")
            .navigationDestination(for: Role.self) { role in
                RoleDetailView(role: role)
            }
            .toolbar {
                if canCreate {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showCreate = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityIdentifier("roles.createButton")
                    }
                }
            }
            .sheet(isPresented: $showCreate) {
                RoleCreateSheet(viewModel: viewModel)
            }
            .onChange(of: showPermissionInfo) { _, expanded in
                if expanded { Task { await viewModel.loadPermissionCatalogIfNeeded() } }
            }
            .refreshable { await viewModel.refresh() }
            .task { await viewModel.load() }
            .errorAlert($viewModel.errorMessage)
        }
    }

    /// The grouped, read-only permission catalog — every `PermissionGroup` with its
    /// permissions' `displayName`/`description`, mirroring the reference frontend's grid of
    /// `PERMISSION_GROUPS` exactly (just laid out vertically instead of in a two-column grid).
    @ViewBuilder
    private var permissionInfoContent: some View {
        if viewModel.allPermissions.isEmpty {
            ProgressView().frame(maxWidth: .infinity)
        } else {
            ForEach(PermissionGroup.allCases, id: \.self) { group in
                let permissions = viewModel.allPermissions
                    .filter { PermissionGroup.group(forKey: $0.key) == group }
                    .sorted { ($0.displayName ?? $0.key) < ($1.displayName ?? $1.key) }
                if !permissions.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(group.rawValue)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .textCase(.uppercase)
                        ForEach(permissions) { permission in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(permission.displayName ?? permission.key)
                                    .font(.subheadline.weight(.medium))
                                if let description = permission.description, !description.isEmpty {
                                    Text(description)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }
}

private struct RoleRowView: View {
    let role: Role

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(role.name).font(.body.weight(.medium))
                if let description = role.description, !description.isEmpty {
                    Text(description).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text("\(role.permissions.count) Berechtigungen")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

/// Reuses `RolesListViewModel` directly (rather than a dedicated create view model) — the form
/// is just name/description, and doing it this way means a successful create both refreshes
/// the list and surfaces failures via the same `errorMessage`/`.errorAlert` this sheet is
/// attached to, without a second round trip back through the presenting view.
private struct RoleCreateSheet: View {
    @Bindable var viewModel: RolesListViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var isSaving = false

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("roles.create.nameField")
                    TextField("Beschreibung", text: $description)
                        .accessibilityIdentifier("roles.create.descriptionField")
                }
            }
            .navigationTitle("Neue Rolle")
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
                                let created = await viewModel.create(name: name, description: description)
                                isSaving = false
                                if created { dismiss() }
                            }
                        }
                        .disabled(!canSave)
                        .accessibilityIdentifier("roles.create.saveButton")
                    }
                }
            }
            .errorAlert($viewModel.errorMessage)
        }
    }
}

#Preview {
    RolesListView()
        .environment(AuthSession.shared)
}
