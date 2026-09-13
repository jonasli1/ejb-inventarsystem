import SwiftUI

struct UserCreateView: View {
    var onCreated: (User) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = UserCreateViewModel()

    var body: some View {
        NavigationStack {
            Form {
                Section("Angaben") {
                    TextField("E-Mail-Adresse", text: $viewModel.email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("users.create.emailField")
                    TextField("Anzeigename", text: $viewModel.displayName)
                        .textContentType(.name)
                        .accessibilityIdentifier("users.create.displayNameField")
                }

                Section {
                    Toggle("Passwort jetzt setzen", isOn: $viewModel.setsPassword.animation())
                        .accessibilityIdentifier("users.create.setsPasswordToggle")
                    if viewModel.setsPassword {
                        SecureField("Passwort", text: $viewModel.password)
                            .textContentType(.newPassword)
                            .accessibilityIdentifier("users.create.passwordField")
                    }
                } footer: {
                    Text(viewModel.setsPassword
                         ? "Mindestens 8 Zeichen."
                         : "Ohne Passwort kann sich die Person nur über ChurchTools oder Passkey anmelden.")
                }
            }
            .navigationTitle("Neue Person")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSaving {
                        ProgressView()
                    } else {
                        Button("Speichern") {
                            Task {
                                if let created = await viewModel.save() {
                                    onCreated(created)
                                }
                            }
                        }
                        .disabled(!viewModel.canSave)
                        .accessibilityIdentifier("users.create.saveButton")
                    }
                }
            }
            .errorAlert($viewModel.errorMessage)
        }
    }
}

#Preview {
    UserCreateView { _ in }
}
