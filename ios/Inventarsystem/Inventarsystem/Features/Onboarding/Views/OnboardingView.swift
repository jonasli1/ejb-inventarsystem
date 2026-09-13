import SwiftUI

/// First-run setup screen — the app ships with no built-in API address. Also reused (via
/// `isChangingExistingServer`) from Settings when the user wants to point the app at a
/// different backend instance.
struct OnboardingView: View {
    var isChangingExistingServer = false
    var onCancel: (() -> Void)?

    @State private var viewModel: OnboardingViewModel
    @FocusState private var fieldFocused: Bool

    init(isChangingExistingServer: Bool = false, onCancel: (() -> Void)? = nil) {
        self.isChangingExistingServer = isChangingExistingServer
        self.onCancel = onCancel
        _viewModel = State(initialValue: OnboardingViewModel(isChangingExistingServer: isChangingExistingServer))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: "shippingbox.fill")
                            .font(.system(size: 40))
                            .foregroundStyle(Color.accentColor)
                        Text("Inventarsystem einrichten")
                            .font(.title2.bold())
                        Text("Gib die Adresse deines Inventarsystem-Servers ein. Du findest sie z. B. in der Adressleiste, wenn du die Web-Oberfläche öffnest.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Server-Adresse")
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(.secondary)
                        TextField("https://ejb.lindner.app", text: $viewModel.rawInput)
                            .textFieldStyle(.roundedBorder)
                            .keyboardType(.URL)
                            .textContentType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($fieldFocused)
                            .onSubmit(submit)
                            .accessibilityIdentifier("onboarding.serverAddressField")
                    }

                    if let errorMessage = viewModel.errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline)
                            .foregroundStyle(.red)
                    }

                    Button(action: submit) {
                        if viewModel.isValidating {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Weiter")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(viewModel.rawInput.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isValidating)
                    .accessibilityIdentifier("onboarding.continueButton")

                    if isChangingExistingServer {
                        Text("Hinweis: Nach dem Wechsel der Server-Adresse musst du dich erneut anmelden.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(24)
            }
            .navigationTitle(isChangingExistingServer ? "Server ändern" : "Einrichtung")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if isChangingExistingServer {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Abbrechen") { onCancel?() }
                    }
                }
            }
        }
        .onAppear { fieldFocused = true }
    }

    private func submit() {
        Task { await viewModel.submit() }
    }
}

#Preview {
    OnboardingView()
}

#Preview("Server ändern") {
    OnboardingView(isChangingExistingServer: true, onCancel: {})
}
