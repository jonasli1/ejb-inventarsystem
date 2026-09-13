import SwiftUI

struct LoginView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = LoginViewModel()
    @State private var showForgotPassword = false
    @FocusState private var focusedField: Field?

    private enum Field { case email, password }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header

                    VStack(spacing: 12) {
                        TextField("E-Mail-Adresse", text: $viewModel.email)
                            .textFieldStyle(.roundedBorder)
                            .keyboardType(.emailAddress)
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .password }
                            .accessibilityIdentifier("login.emailField")

                        SecureField("Passwort", text: $viewModel.password)
                            .textFieldStyle(.roundedBorder)
                            .textContentType(.password)
                            .focused($focusedField, equals: .password)
                            .submitLabel(.go)
                            .onSubmit(submit)
                            .accessibilityIdentifier("login.passwordField")
                    }

                    if let errorMessage = viewModel.errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button(action: submit) {
                        if viewModel.isLoading {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Anmelden").frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(!viewModel.canSubmit)
                    .accessibilityIdentifier("login.submitButton")

                    Button("Passwort vergessen?") { showForgotPassword = true }
                        .font(.footnote)

                    if session.publicConfig.churchToolsAvailable || session.publicConfig.passkeyAvailable {
                        alternativeLoginMethods
                    }
                }
                .padding(24)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(session.publicConfig.displayName).font(.headline)
                }
            }
            .sheet(isPresented: $showForgotPassword) {
                ForgotPasswordView()
            }
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            if let logoDataUrl = session.publicConfig.logoDataUrl, let image = decodedLogo(logoDataUrl) {
                image
                    .resizable()
                    .scaledToFit()
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            } else {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.accentColor)
            }
            Text(session.publicConfig.displayName)
                .font(.title.bold())
        }
        .padding(.top, 16)
    }

    private var alternativeLoginMethods: some View {
        VStack(spacing: 12) {
            HStack {
                divider
                Text("oder").font(.footnote).foregroundStyle(.secondary)
                divider
            }

            if session.publicConfig.churchToolsAvailable {
                Button {
                    Task { await viewModel.loginWithChurchTools() }
                } label: {
                    Text("Mit ChurchTools anmelden").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(viewModel.isLoading)
                .accessibilityIdentifier("login.churchToolsButton")
            }

            if session.publicConfig.passkeyAvailable {
                Button {
                    Task { await viewModel.loginWithPasskey() }
                } label: {
                    Label("Mit Passkey anmelden", systemImage: "person.badge.key.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(viewModel.isLoading)
                .accessibilityIdentifier("login.passkeyButton")
            }
        }
    }

    private var divider: some View {
        Rectangle().fill(Color.secondary.opacity(0.3)).frame(height: 1)
    }

    private func decodedLogo(_ dataURL: String) -> Image? {
        guard let commaIndex = dataURL.firstIndex(of: ","),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: commaIndex)...])),
              let uiImage = UIImage(data: data)
        else { return nil }
        return Image(uiImage: uiImage)
    }

    private func submit() {
        Task { await viewModel.loginLocal() }
    }
}

#Preview {
    LoginView()
        .environment(AuthSession.shared)
}
