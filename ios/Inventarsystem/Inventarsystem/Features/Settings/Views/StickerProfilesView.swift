import SwiftUI
import UniformTypeIdentifiers

/// Manages the configurable sticker/label profiles used by the on-device inventory-number
/// scanner (`StickerScanButton`) — not hardcoded to the seeded "EJB Standard" profile.
struct StickerProfilesView: View {
    @State private var viewModel = StickerProfilesViewModel()
    @State private var showEditor = false
    @State private var editingProfile: StickerProfile?
    @State private var showImporter = false

    var body: some View {
        List {
            Section {
                ForEach(viewModel.profiles) { profile in
                    Button {
                        editingProfile = profile
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(profile.name)
                                    .font(.headline)
                                if profile.isDefault {
                                    Text("Standard")
                                        .font(.caption2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(.tint.opacity(0.15), in: Capsule())
                                }
                            }
                            Text("Präfix „\(profile.praefix)“ · \(profile.extraktionsMuster.count) Muster · \(profile.beispielbilder.count) Beispielbilder")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .tint(.primary)
                    .swipeActions(edge: .trailing) {
                        if !profile.isDefault {
                            Button("Als Standard") { viewModel.makeDefault(profile) }
                                .tint(.blue)
                        }
                    }
                }
                .onDelete(perform: viewModel.delete)
            } footer: {
                Text("Jedes Profil beschreibt eine Aufkleber-Art: Präfix, Trennzeichen, Erkennungsmuster und Beispielbilder zur Kalibrierung. Das Standardprofil greift, wenn kein anderes Profil zum Foto passt.")
            }

            Section {
                Button {
                    viewModel.exportProfiles()
                } label: {
                    Label("Profile exportieren", systemImage: "square.and.arrow.up")
                }
                Button {
                    showImporter = true
                } label: {
                    Label("Profile importieren", systemImage: "square.and.arrow.down")
                }
            }
        }
        .navigationTitle("Sticker-Profile")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    editingProfile = nil
                    showEditor = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .errorAlert($viewModel.errorMessage)
        .sheet(isPresented: $showEditor) {
            NavigationStack { StickerProfileEditorView(profile: nil) }
        }
        .sheet(item: $editingProfile) { profile in
            NavigationStack { StickerProfileEditorView(profile: profile) }
        }
        .fileExporter(
            isPresented: Binding(get: { viewModel.exportedFileURL != nil }, set: { if !$0 { viewModel.exportedFileURL = nil } }),
            document: viewModel.exportedFileURL.map { JSONFileDocument(url: $0) },
            contentType: .json,
            defaultFilename: "sticker-profile"
        ) { _ in }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
            if case .success(let url) = result {
                viewModel.importProfiles(from: url)
            }
        }
    }
}

/// Minimal `FileDocument` wrapper so `fileExporter` can hand out an already-written temp file.
private struct JSONFileDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.json]
    let url: URL

    init(url: URL) { self.url = url }

    init(configuration: ReadConfiguration) throws {
        throw CocoaError(.fileReadUnsupportedScheme)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        try FileWrapper(url: url)
    }
}

#Preview {
    NavigationStack { StickerProfilesView() }
}
