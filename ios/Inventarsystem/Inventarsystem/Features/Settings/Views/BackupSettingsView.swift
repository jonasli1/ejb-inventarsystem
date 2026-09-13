import SwiftUI
import UniformTypeIdentifiers

/// Mirrors the frontend's `BackupPage`: manual export/import (with the same "ÜBERSCHREIBEN"
/// confirm-phrase gate before an import) plus automatic-backup scheduling to SFTP or OneDrive.
struct BackupSettingsView: View {
    private static let confirmPhrase = "ÜBERSCHREIBEN"

    @State private var viewModel = BackupSettingsViewModel()
    @State private var showFileImporter = false
    @State private var pendingImportData: Data?
    @State private var pendingImportName = ""
    @State private var confirmText = ""

    var body: some View {
        Form {
            if viewModel.isLoading {
                ProgressView()
            } else {
                Section {
                    Button {
                        Task { await viewModel.exportBackup() }
                    } label: {
                        if viewModel.isExporting {
                            ProgressView()
                        } else {
                            Label("Backup herunterladen", systemImage: "square.and.arrow.down")
                        }
                    }
                    Button {
                        showFileImporter = true
                    } label: {
                        Label("Backup-Datei auswählen …", systemImage: "square.and.arrow.up")
                    }

                    if pendingImportData != nil {
                        VStack(alignment: .leading, spacing: 8) {
                            Label {
                                Text("Achtung: Das Einspielen von „\(pendingImportName)“ überschreibt alle aktuellen Daten (Datenbank und Dateien) unwiderruflich. Zur Bestätigung bitte \(Self.confirmPhrase) eingeben.")
                            } icon: {
                                Image(systemName: "exclamationmark.triangle.fill")
                            }
                            .font(.footnote)
                            .foregroundStyle(.red)

                            TextField(Self.confirmPhrase, text: $confirmText)
                                .textFieldStyle(.roundedBorder)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.characters)

                            HStack {
                                Button("Jetzt überschreiben", role: .destructive) {
                                    guard let data = pendingImportData else { return }
                                    Task {
                                        await viewModel.importBackup(data: data)
                                        pendingImportData = nil
                                        confirmText = ""
                                    }
                                }
                                .disabled(confirmText != Self.confirmPhrase || viewModel.isImporting)
                                Button("Abbrechen") {
                                    pendingImportData = nil
                                    confirmText = ""
                                }
                            }
                        }
                    }
                } header: {
                    Text("Manuelles Backup")
                }

                Section {
                    Toggle("Automatisches Backup aktiv", isOn: $viewModel.enabled)
                    Picker("Häufigkeit", selection: $viewModel.frequency) {
                        ForEach(BackupFrequency.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Picker("Ziel", selection: $viewModel.destinationType) {
                        Text("Kein Ziel gewählt").tag(BackupDestinationType?.none)
                        ForEach(BackupDestinationType.allCases, id: \.self) { Text($0.label).tag(Optional($0)) }
                    }
                } header: {
                    Text("Automatisches Backup")
                }

                if viewModel.destinationType == .sftp {
                    Section("SFTP") {
                        TextField("Host", text: $viewModel.sftpHost)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                        TextField("Port", text: $viewModel.sftpPort)
                            .keyboardType(.numberPad)
                        TextField("Benutzername", text: $viewModel.sftpUsername)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                        SecureField(viewModel.sftpPasswordSet ? "Passwort (unverändert lassen = beibehalten)" : "Passwort", text: $viewModel.sftpPassword)
                        TextField("Zielverzeichnis", text: $viewModel.sftpRemotePath, prompt: Text("/backups"))
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                }

                if viewModel.destinationType == .onedrive {
                    Section("OneDrive") {
                        if !viewModel.onedriveConfigured {
                            Text("OneDrive ist serverseitig nicht konfiguriert.")
                                .font(.footnote)
                                .foregroundStyle(.orange)
                        } else {
                            HStack {
                                Text(viewModel.onedriveConnected ? "Verbunden" : "Nicht verbunden")
                                    .font(.caption)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(viewModel.onedriveConnected ? .green.opacity(0.15) : .gray.opacity(0.15), in: Capsule())
                                Spacer()
                                Button {
                                    Task { await viewModel.connectOneDrive() }
                                } label: {
                                    if viewModel.isConnectingOneDrive {
                                        ProgressView()
                                    } else {
                                        Text(viewModel.onedriveConnected ? "Neu verbinden" : "OneDrive verbinden")
                                    }
                                }
                            }
                        }
                        TextField("Zielordner", text: $viewModel.onedriveFolderPath, prompt: Text("/Backups/Inventarsystem"))
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                }

                if let lastRunAt = viewModel.lastRunAt {
                    Section {
                        Text("Letzter Lauf: \(lastRunAt.formatted(date: .abbreviated, time: .shortened)) – \(viewModel.lastRunStatus == "success" ? "erfolgreich" : "Fehler")\(viewModel.lastRunMessage.map { " (\($0))" } ?? "")")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                if let testResultMessage = viewModel.testResultMessage {
                    Section {
                        Text(testResultMessage)
                            .font(.footnote)
                            .foregroundStyle(viewModel.testResultIsSuccess ? .green : .red)
                    }
                }

                Section {
                    Button {
                        Task { await viewModel.test() }
                    } label: {
                        if viewModel.isTesting {
                            ProgressView()
                        } else {
                            Text("Verbindung testen")
                        }
                    }
                    .disabled(viewModel.destinationType == nil || viewModel.isTesting)

                    Button {
                        Task { await viewModel.save() }
                    } label: {
                        if viewModel.isSaving {
                            ProgressView()
                        } else {
                            Text("Speichern")
                        }
                    }
                    .disabled(viewModel.isSaving)
                }
            }
        }
        .navigationTitle("Backup")
        .navigationBarTitleDisplayMode(.inline)
        .errorAlert($viewModel.errorMessage)
        .alert("Erfolg", isPresented: Binding(
            get: { viewModel.successMessage != nil },
            set: { if !$0 { viewModel.successMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.successMessage ?? "")
        }
        .fileExporter(
            isPresented: Binding(get: { viewModel.exportedData != nil }, set: { if !$0 { viewModel.exportedData = nil } }),
            document: viewModel.exportedData.map { BackupFileDocument(data: $0) },
            contentType: .data,
            defaultFilename: "inventarsystem-backup.tar.gz"
        ) { _ in }
        .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.data, .item]) { result in
            if case .success(let url) = result {
                let needsAccess = url.startAccessingSecurityScopedResource()
                defer { if needsAccess { url.stopAccessingSecurityScopedResource() } }
                if let data = try? Data(contentsOf: url) {
                    pendingImportData = data
                    pendingImportName = url.lastPathComponent
                }
            }
        }
        .task { await viewModel.load() }
    }
}

private struct BackupFileDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.data]
    let data: Data

    init(data: Data) { self.data = data }

    init(configuration: ReadConfiguration) throws {
        throw CocoaError(.fileReadUnsupportedScheme)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

#Preview {
    NavigationStack { BackupSettingsView() }
}
