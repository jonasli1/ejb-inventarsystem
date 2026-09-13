import SwiftUI

/// Requests a password-reset e-mail. Completing the reset happens by following the link the
/// e-mail contains (opened in the browser, same as the web frontend) — there is no in-app
/// reset screen, since that link intentionally points at the backend's configured web origin.
struct ForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var isLoading = false
    @State private var resultMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("E-Mail-Adresse", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } footer: {
                    Text("Falls zu dieser Adresse ein Konto existiert, senden wir einen Link zum Zurücksetzen des Passworts.")
                }

                if let resultMessage {
                    Section {
                        Text(resultMessage)
                    }
                }
            }
            .navigationTitle("Passwort vergessen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Schließen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isLoading {
                        ProgressView()
                    } else {
                        Button("Senden") { send() }
                            .disabled(email.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
        }
    }

    private func send() {
        isLoading = true
        Task {
            defer { isLoading = false }
            // The backend always returns 204 here regardless of whether the account exists,
            // deliberately preventing user enumeration — surface the same generic message.
            try? await LoginService.forgotPassword(email: email)
            resultMessage = "Falls ein Konto mit dieser Adresse existiert, wurde eine E-Mail verschickt."
        }
    }
}

#Preview {
    ForgotPasswordView()
}
