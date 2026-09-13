import SwiftUI
import PhotosUI

/// Mirrors the frontend's `GeneralSettingsPage`: display name, logo, and which login methods
/// are offered — 1:1 with its labels and helper texts.
struct GeneralSettingsView: View {
    @State private var viewModel = GeneralSettingsViewModel()
    @State private var logoPickerItem: PhotosPickerItem?

    var body: some View {
        Form {
            if viewModel.isLoading {
                ProgressView()
            } else {
                Section {
                    TextField("Name", text: $viewModel.displayName, prompt: Text("Inventarsystem"))
                } header: {
                    Text("Name")
                }

                Section {
                    HStack(spacing: 12) {
                        Group {
                            if let logoImage = viewModel.logoImage {
                                logoImage.resizable().scaledToFit()
                            } else {
                                Image(systemName: "photo")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .frame(width: 56, height: 56)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))

                        VStack(alignment: .leading, spacing: 6) {
                            PhotosPicker(
                                viewModel.logoImage == nil ? "Hochladen" : "Ersetzen",
                                selection: $logoPickerItem,
                                matching: .images
                            )
                            if viewModel.logoImage != nil {
                                Button("Entfernen", role: .destructive) {
                                    Task { await viewModel.removeLogo() }
                                }
                            }
                        }
                        if viewModel.isUploadingLogo {
                            Spacer()
                            ProgressView()
                        }
                    }
                } header: {
                    Text("Logo")
                } footer: {
                    Text("Erscheint oben links in der Seitenleiste und als Favicon im Browser-Tab.")
                }

                Section {
                    Toggle("ChurchTools-Login aktiviert", isOn: $viewModel.churchToolsEnabled)
                    Toggle("Passkey-Login aktiviert", isOn: $viewModel.passkeyEnabled)
                } header: {
                    Text("Anmeldemethoden")
                } footer: {
                    Text("Deaktivierte Methoden werden auf der Login-Seite ausgeblendet und serverseitig abgelehnt – z. B. sinnvoll, solange ChurchTools noch nicht eingerichtet ist.")
                }
            }
        }
        .navigationTitle("Allgemein")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if viewModel.isSaving {
                    ProgressView()
                } else {
                    Button("Speichern") { Task { await viewModel.save() } }
                }
            }
        }
        .errorAlert($viewModel.errorMessage)
        .alert("Gespeichert", isPresented: Binding(
            get: { viewModel.successMessage != nil },
            set: { if !$0 { viewModel.successMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.successMessage ?? "")
        }
        .onChange(of: logoPickerItem) { _, newValue in
            guard let newValue else { return }
            Task {
                if let data = try? await newValue.loadTransferable(type: Data.self) {
                    await viewModel.uploadLogo(data: data, mimeType: "image/jpeg")
                }
                logoPickerItem = nil
            }
        }
        .task { await viewModel.load() }
    }
}

#Preview {
    NavigationStack { GeneralSettingsView() }
}
