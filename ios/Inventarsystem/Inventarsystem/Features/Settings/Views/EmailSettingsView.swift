import SwiftUI

/// Mirrors the frontend's `EmailSettingsPage`: Server / Vorlagen / Fußzeile tabs, same labels.
struct EmailSettingsView: View {
    private enum Tab: String, CaseIterable, Identifiable {
        case server = "Server", templates = "Vorlagen", footer = "Fußzeile"
        var id: String { rawValue }
    }

    @State private var viewModel = EmailSettingsViewModel()
    @State private var tab: Tab = .server

    var body: some View {
        VStack(spacing: 0) {
            Picker("Bereich", selection: $tab) {
                ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding()

            if viewModel.isLoading {
                Spacer()
                ProgressView()
                Spacer()
            } else {
                switch tab {
                case .server: serverForm
                case .templates: templatesList
                case .footer: footerForm
                }
            }
        }
        .navigationTitle("E-Mail")
        .navigationBarTitleDisplayMode(.inline)
        .errorAlert($viewModel.errorMessage)
        .alert("Gespeichert", isPresented: Binding(
            get: { viewModel.successMessage != nil },
            set: { if !$0 { viewModel.successMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.successMessage ?? "")
        }
        .sheet(item: $viewModel.editingTemplate) { _ in
            TemplateEditorSheet(viewModel: viewModel)
        }
        .task { await viewModel.load() }
    }

    private var serverForm: some View {
        Form {
            Section {
                Toggle("E-Mail-Versand aktiv", isOn: $viewModel.enabled)
            }
            Section {
                TextField("SMTP-Host", text: $viewModel.host, prompt: Text("smtp.example.com"))
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                TextField("Port", text: $viewModel.port)
                    .keyboardType(.numberPad)
                TextField("Benutzername", text: $viewModel.username)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                SecureField(viewModel.passwordSet ? "Passwort (unverändert lassen = beibehalten)" : "Passwort", text: $viewModel.password)
                TextField("Absenderadresse", text: $viewModel.fromAddress, prompt: Text("inventarsystem@example.com"))
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                TextField("Absendername", text: $viewModel.fromName, prompt: Text("Inventarsystem"))
                Toggle("TLS verwenden", isOn: $viewModel.secure)
            } footer: {
                Text("TLS ist üblich für Port 465; bei 587/25 mit STARTTLS deaktivieren.")
            }

            Section {
                TextField("Test-E-Mail an", text: $viewModel.testAddress, prompt: Text("test@example.com"))
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                Button {
                    Task { await viewModel.sendTestEmail() }
                } label: {
                    if viewModel.isTesting {
                        ProgressView()
                    } else {
                        Text("Test-E-Mail senden")
                    }
                }
                .disabled(viewModel.testAddress.isEmpty || viewModel.isTesting)
                if let message = viewModel.testResultMessage {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(viewModel.testResultIsSuccess ? .green : .red)
                }
            }

            Section {
                Button {
                    Task { await viewModel.saveServer() }
                } label: {
                    if viewModel.isSavingServer {
                        ProgressView()
                    } else {
                        Text("Speichern")
                    }
                }
                .disabled(viewModel.isSavingServer)
            }
        }
    }

    private var templatesList: some View {
        List(viewModel.templates) { template in
            Button {
                viewModel.beginEditingTemplate(template)
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(template.label).font(.body)
                        Text(template.subject)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer()
                    if template.isCustomized {
                        Text("Angepasst")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.blue.opacity(0.15), in: Capsule())
                    }
                }
            }
            .tint(.primary)
        }
        .overlay {
            if viewModel.templates.isEmpty {
                ContentUnavailableView("Keine Benachrichtigungstypen gefunden", systemImage: "envelope")
            }
        }
    }

    private var footerForm: some View {
        Form {
            Section {
                Text("Wird am Ende jeder Benachrichtigungs-E-Mail angezeigt. Leer lassen, um den Standardtext zu verwenden.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                TextEditor(text: $viewModel.footerHtml)
                    .frame(minHeight: 120)
                    .font(.system(.body, design: .monospaced))
            } header: {
                Text("HTML")
            }
            Section("Vorschau") {
                HTMLPreviewView(html: viewModel.footerHtml)
                    .frame(minHeight: 100)
            }
            Section {
                Button {
                    Task { await viewModel.saveFooter() }
                } label: {
                    if viewModel.isSavingFooter {
                        ProgressView()
                    } else {
                        Text("Speichern")
                    }
                }
                .disabled(viewModel.isSavingFooter)
            }
        }
    }
}

private struct TemplateEditorSheet: View {
    let viewModel: EmailSettingsViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Betreff") {
                    TextField("Betreff", text: Binding(
                        get: { viewModel.draftSubject },
                        set: { viewModel.draftSubject = $0 }
                    ))
                }
                Section("Inhalt") {
                    TextEditor(text: Binding(
                        get: { viewModel.draftBodyHtml },
                        set: { viewModel.draftBodyHtml = $0 }
                    ))
                    .frame(minHeight: 160)
                    .font(.system(.body, design: .monospaced))
                }
                if let variables = viewModel.editingTemplate?.variables, !variables.isEmpty {
                    Section("Platzhalter") {
                        ForEach(variables) { variable in
                            Button {
                                viewModel.draftBodyHtml += "{{\(variable.key)}}"
                            } label: {
                                VStack(alignment: .leading) {
                                    Text("{{\(variable.key)}}").font(.system(.body, design: .monospaced))
                                    Text(variable.description).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                Section("Vorschau") {
                    HTMLPreviewView(html: viewModel.draftBodyHtml)
                        .frame(minHeight: 120)
                }
                if viewModel.editingTemplate?.isCustomized == true {
                    Section {
                        Button("Auf Standard zurücksetzen", role: .destructive) {
                            Task { await viewModel.resetTemplate() }
                        }
                    }
                }
            }
            .navigationTitle(viewModel.editingTemplate?.label ?? "Vorlage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { viewModel.editingTemplate = nil }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSavingTemplate {
                        ProgressView()
                    } else {
                        Button("Speichern") { Task { await viewModel.saveTemplate() } }
                    }
                }
            }
        }
    }
}

#Preview {
    NavigationStack { EmailSettingsView() }
}
