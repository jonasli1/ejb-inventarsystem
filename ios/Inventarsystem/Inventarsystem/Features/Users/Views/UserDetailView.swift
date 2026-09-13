import SwiftUI

struct UserDetailView: View {
    let userId: String

    @Environment(AuthSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: UserDetailViewModel
    @State private var tab: Tab = .overview
    @State private var showDeleteConfirm = false
    @State private var showResetPassword = false
    @State private var showChangeEmail = false
    @State private var showRolePicker = false
    @State private var showGroupPicker = false

    private enum Tab: String, CaseIterable { case overview = "Übersicht", roles = "Rollen", groups = "Gruppen" }

    init(userId: String) {
        self.userId = userId
        _viewModel = State(initialValue: UserDetailViewModel(userId: userId))
    }

    private var canUpdate: Bool { session.hasPermission("users.update") }
    private var canDelete: Bool { session.hasPermission("users.delete") }
    private var canResetPassword: Bool { session.hasPermission("users.reset_password") }
    private var canChangeEmail: Bool { session.hasPermission("users.change_email") }
    /// Role *assignment* (add and remove alike) is gated on `permissions.assign` specifically —
    /// a different key than `users.update`, per the backend's actual endpoint permission.
    private var canAssignRoles: Bool { session.hasPermission("permissions.assign") }
    /// Group-membership assignment is gated on `groups.update` — a `groups.*` key even though
    /// it's edited from this screen, per the backend's `/users/:id/groups` endpoint permission.
    private var canUpdateGroups: Bool { session.hasPermission("groups.update") }

    var body: some View {
        Group {
            if let user = viewModel.user {
                content(for: user)
            } else if viewModel.isLoading {
                ProgressView()
            } else {
                ContentUnavailableView("Person nicht gefunden", systemImage: "person.crop.circle.badge.questionmark")
            }
        }
        .navigationTitle(viewModel.user?.displayName ?? "Person")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.errorMessage)
        .onChange(of: viewModel.isDeleted) { _, deleted in if deleted { dismiss() } }
    }

    @ViewBuilder
    private func content(for user: User) -> some View {
        VStack(spacing: 0) {
            Picker("Ansicht", selection: $tab) {
                ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding()
            .accessibilityIdentifier("users.detail.tabPicker")

            ScrollView {
                switch tab {
                case .overview: overviewTab(user)
                case .roles: rolesTab
                case .groups: groupsTab
                }
            }
        }
        .toolbar {
            if tab == .overview && canUpdate {
                ToolbarItem(placement: .primaryAction) {
                    if viewModel.isEditing {
                        Button("Fertig") { Task { _ = await viewModel.saveEdits() } }
                            .disabled(viewModel.isSaving)
                            .accessibilityIdentifier("users.detail.doneButton")
                    } else {
                        Button("Bearbeiten") { viewModel.beginEditing() }
                            .accessibilityIdentifier("users.detail.editButton")
                    }
                }
            }
        }
    }

    // MARK: - Übersicht

    @ViewBuilder
    private func overviewTab(_ user: User) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            if viewModel.isEditing {
                editForm
            } else {
                readOnlyOverview(user)
            }

            Divider()

            authIdentitiesSection

            if canResetPassword || canChangeEmail {
                Divider()
                VStack(alignment: .leading, spacing: 8) {
                    if canResetPassword {
                        Button("Passwort zurücksetzen") { showResetPassword = true }
                            .accessibilityIdentifier("users.detail.resetPasswordButton")
                    }
                    if canChangeEmail {
                        Button("E-Mail ändern") { showChangeEmail = true }
                            .accessibilityIdentifier("users.detail.changeEmailButton")
                    }
                }
            }

            if canDelete && !viewModel.isEditing {
                Button("Person löschen", role: .destructive) { showDeleteConfirm = true }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
                    .accessibilityIdentifier("users.detail.deleteButton")
            }
        }
        .padding()
        .confirmationDialog(
            "Person „\(user.displayName)“ endgültig löschen? Dies kann nicht rückgängig gemacht werden.",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Endgültig löschen", role: .destructive) { Task { await viewModel.delete() } }
            Button("Abbrechen", role: .cancel) {}
        }
        .sheet(isPresented: $showResetPassword) {
            ResetPasswordSheet { newPassword in
                showResetPassword = false
                Task { await viewModel.resetPassword(newPassword: newPassword) }
            }
        }
        .sheet(isPresented: $showChangeEmail) {
            ChangeEmailSheet(currentEmail: user.email) { newEmail in
                showChangeEmail = false
                Task { await viewModel.changeEmail(newEmail) }
            }
        }
    }

    private func readOnlyOverview(_ user: User) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            LabeledContent("Anzeigename", value: user.displayName)
            LabeledContent("E-Mail-Adresse", value: user.email)
            LabeledContent("Status", value: user.isActive ? "Aktiv" : "Inaktiv")
        }
    }

    private var editForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Anzeigename", text: $viewModel.editDisplayName)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("users.detail.displayNameField")
            Toggle("Aktiv", isOn: $viewModel.editIsActive)
                .accessibilityIdentifier("users.detail.isActiveToggle")
            Button("Abbrechen") { viewModel.cancelEditing() }
                .font(.footnote)
        }
    }

    private var authIdentitiesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Anmeldemethoden").font(.headline)
            if viewModel.authIdentities.isEmpty {
                Text("Keine Anmeldemethoden erfasst.").foregroundStyle(.secondary).font(.footnote)
            } else {
                ForEach(Array(viewModel.authIdentities.enumerated()), id: \.offset) { _, identity in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(germanAuthProviderLabel(identity.provider)).font(.subheadline.weight(.medium))
                            if let deviceLabel = identity.deviceLabel {
                                Text(deviceLabel).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Text(identity.createdAt, style: .date).font(.caption).foregroundStyle(.tertiary)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    // MARK: - Rollen

    @ViewBuilder
    private var rolesTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            if viewModel.userRoles.isEmpty {
                Text("Keine Rollen zugewiesen.").foregroundStyle(.secondary)
            } else {
                ForEach(viewModel.userRoles, id: \.roleId) { link in
                    HStack {
                        Text(link.role.name).font(.subheadline.weight(.medium))
                        Spacer()
                        if canAssignRoles {
                            Button(role: .destructive) {
                                Task { await viewModel.removeRole(link.roleId) }
                            } label: {
                                Image(systemName: "minus.circle")
                            }
                            .accessibilityIdentifier("users.detail.removeRoleButton.\(link.roleId)")
                        }
                    }
                    Divider()
                }
            }

            if canAssignRoles {
                Button {
                    Task {
                        await viewModel.loadAssignablesIfNeeded()
                        showRolePicker = true
                    }
                } label: {
                    Label("Rolle hinzufügen", systemImage: "plus")
                }
                .accessibilityIdentifier("users.detail.addRoleButton")
            }
        }
        .padding()
        .sheet(isPresented: $showRolePicker) {
            RolePickerSheet(roles: viewModel.assignableRoles) { roleId in
                showRolePicker = false
                Task { await viewModel.assignRole(roleId) }
            }
        }
    }

    // MARK: - Gruppen

    @ViewBuilder
    private var groupsTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            if viewModel.groupMemberships.isEmpty {
                Text("Keine Gruppenmitgliedschaften.").foregroundStyle(.secondary)
            } else {
                ForEach(viewModel.groupMemberships) { membership in
                    HStack {
                        Text(membership.group.name).font(.subheadline.weight(.medium))
                        Spacer()
                        if membership.source == "churchtools" {
                            // Synced automatically on every ChurchTools login — must never be
                            // removed through the manual assignment endpoint, so no button here.
                            Text("(ChurchTools)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else if canUpdateGroups {
                            Button(role: .destructive) {
                                Task { await viewModel.removeFromGroup(membership.groupId) }
                            } label: {
                                Image(systemName: "minus.circle")
                            }
                            .accessibilityIdentifier("users.detail.removeGroupButton.\(membership.groupId)")
                        }
                    }
                    Divider()
                }
            }

            if canUpdateGroups {
                Button {
                    Task {
                        await viewModel.loadAssignablesIfNeeded()
                        showGroupPicker = true
                    }
                } label: {
                    Label("Gruppe hinzufügen", systemImage: "plus")
                }
                .accessibilityIdentifier("users.detail.addGroupButton")
            }
        }
        .padding()
        .sheet(isPresented: $showGroupPicker) {
            GroupPickerSheet(groups: viewModel.assignableGroups) { groupId in
                showGroupPicker = false
                Task { await viewModel.addToGroup(groupId) }
            }
        }
    }
}

/// Maps `AuthIdentitySummary.provider` to its German label, matching the reference frontend.
private nonisolated func germanAuthProviderLabel(_ provider: String) -> String {
    switch provider {
    case "local": return "Lokal (Passwort)"
    case "churchtools": return "ChurchTools"
    case "passkey": return "Passkey"
    default: return provider
    }
}

/// Kept deliberately simple: the "Speichern" action here dismisses eagerly and performs the
/// mutation afterward (`onSubmit` is fire-and-forget), matching how `InventoryDetailView`'s
/// accessory picker dismisses on selection before its network call resolves — any failure
/// surfaces via the (now-visible-again) parent's `errorAlert` rather than a second alert
/// layered under this sheet, which SwiftUI wouldn't show while the sheet is still presented.
private struct ResetPasswordSheet: View {
    var onSubmit: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var password = ""

    private var canSave: Bool { password.count >= 8 }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Neues Passwort", text: $password)
                        .textContentType(.newPassword)
                        .accessibilityIdentifier("users.detail.newPasswordField")
                } footer: {
                    Text("Mindestens 8 Zeichen.")
                }
            }
            .navigationTitle("Passwort zurücksetzen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") { onSubmit(password) }
                        .disabled(!canSave)
                        .accessibilityIdentifier("users.detail.resetPasswordSaveButton")
                }
            }
        }
    }
}

private struct ChangeEmailSheet: View {
    let currentEmail: String
    var onSubmit: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var email: String

    init(currentEmail: String, onSubmit: @escaping (String) -> Void) {
        self.currentEmail = currentEmail
        self.onSubmit = onSubmit
        _email = State(initialValue: currentEmail)
    }

    private var canSave: Bool { !email.isEmpty && email != currentEmail }

    var body: some View {
        NavigationStack {
            Form {
                TextField("E-Mail-Adresse", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("users.detail.newEmailField")
            }
            .navigationTitle("E-Mail ändern")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") { onSubmit(email) }
                        .disabled(!canSave)
                        .accessibilityIdentifier("users.detail.changeEmailSaveButton")
                }
            }
        }
    }
}

/// Roles are a small, fixed vocabulary (see `UserDetailViewModel.loadAssignablesIfNeeded`), so
/// this filters the already-fetched array locally instead of routing through `AsyncSearchPicker`
/// (reserved for large, server-searched collections — see its own doc comment).
private struct RolePickerSheet: View {
    let roles: [Role]
    var onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filteredRoles: [Role] {
        query.isEmpty ? roles : roles.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if roles.isEmpty {
                    ContentUnavailableView("Keine weiteren Rollen verfügbar", systemImage: "person.badge.shield.checkmark")
                } else {
                    List(filteredRoles) { role in
                        Button {
                            onSelect(role.id)
                        } label: {
                            Text(role.name)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .searchable(text: $query, prompt: "Rolle suchen")
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

private struct GroupPickerSheet: View {
    let groups: [AppGroup]
    var onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filteredGroups: [AppGroup] {
        query.isEmpty ? groups : groups.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if groups.isEmpty {
                    ContentUnavailableView("Keine weiteren Gruppen verfügbar", systemImage: "person.3")
                } else {
                    List(filteredGroups) { group in
                        Button {
                            onSelect(group.id)
                        } label: {
                            Text(group.name)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .searchable(text: $query, prompt: "Gruppe suchen")
            .navigationTitle("Gruppe hinzufügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        UserDetailView(userId: "preview-user-id")
    }
    .environment(AuthSession.shared)
}
