import SwiftUI

struct ProfileView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = ProfileViewModel()
    @State private var showChangePassword = false
    @State private var showAddPasskey = false

    var body: some View {
        NavigationStack {
            List {
                if let profile = viewModel.profile {
                    Section("Konto") {
                        LabeledContent("Name", value: profile.displayName)
                        LabeledContent("E-Mail", value: profile.email)
                        LabeledContent("Rollen", value: profile.roles.map(\.name).joined(separator: ", "))
                    }

                    Section("Anmeldemethoden") {
                        ForEach(viewModel.authMethodLabels(), id: \.self) { label in
                            Text(label)
                        }
                        if viewModel.passkeyAvailable {
                            Button("Passkey hinzufügen") { showAddPasskey = true }
                                .disabled(viewModel.isRegisteringPasskey)
                        }
                    }

                    Section("Passwort ändern") {
                        if profile.authMethods.contains("local") {
                            Button("Passwort ändern") { showChangePassword = true }
                        } else {
                            Text("Für dieses Konto ist kein lokales Passwort eingerichtet (Anmeldung nur über ChurchTools/Passkey).")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Section("Darstellung") {
                        Picker("Design", selection: Binding(
                            get: { viewModel.theme },
                            set: { newValue in Task { await viewModel.setTheme(newValue) } }
                        )) {
                            Text("System").tag("system")
                            Text("Hell").tag("light")
                            Text("Dunkel").tag("dark")
                        }
                    }

                    Section("Benachrichtigungen") {
                        if viewModel.isLoadingPreferences {
                            ProgressView()
                        } else if viewModel.notificationPreferences.isEmpty {
                            Text("Für deine aktuellen Berechtigungen sind keine Benachrichtigungs-Ereignisse verfügbar.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(viewModel.notificationPreferences) { preference in
                                Toggle(preference.label, isOn: Binding(
                                    get: { preference.enabled },
                                    set: { newValue in Task { await viewModel.togglePreference(preference, enabled: newValue) } }
                                ))
                            }
                        }
                    }
                }

                Section {
                    Button("Abmelden", role: .destructive) {
                        Task { await viewModel.logout() }
                    }
                    .accessibilityIdentifier("shell.logoutButton")
                }
            }
            .navigationTitle("Profil")
            .errorAlert($viewModel.errorMessage)
            .alert("Erfolg", isPresented: Binding(
                get: { viewModel.successMessage != nil },
                set: { if !$0 { viewModel.successMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.successMessage ?? "")
            }
            .sheet(isPresented: $showChangePassword) {
                ChangePasswordView(viewModel: viewModel)
            }
            .sheet(isPresented: $showAddPasskey) {
                AddPasskeyView(viewModel: viewModel)
            }
            .task { await viewModel.loadNotificationPreferences() }
        }
    }
}

private struct ChangePasswordView: View {
    let viewModel: ProfileViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var current = ""
    @State private var new = ""
    @State private var confirmation = ""

    var body: some View {
        NavigationStack {
            Form {
                SecureField("Aktuelles Passwort", text: $current)
                SecureField("Neues Passwort", text: $new)
                SecureField("Neues Passwort bestätigen", text: $confirmation)
            }
            .navigationTitle("Passwort ändern")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") {
                        Task {
                            if await viewModel.changePassword(current: current, new: new, confirmation: confirmation) {
                                dismiss()
                            }
                        }
                    }
                    .disabled(current.isEmpty || new.count < 8 || new != confirmation)
                }
            }
        }
    }
}

private struct AddPasskeyView: View {
    let viewModel: ProfileViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var deviceLabel = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Gerätename (optional)", text: $deviceLabel)
                } footer: {
                    Text("Zum Beispiel „iPhone von Max“ — hilft, den Passkey später wiederzuerkennen.")
                }
            }
            .navigationTitle("Passkey hinzufügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isRegisteringPasskey {
                        ProgressView()
                    } else {
                        Button("Hinzufügen") {
                            Task {
                                await viewModel.registerPasskey(deviceLabel: deviceLabel)
                                dismiss()
                            }
                        }
                    }
                }
            }
        }
    }
}

#Preview {
    ProfileView()
        .environment(AuthSession.shared)
}
