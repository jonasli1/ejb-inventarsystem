import SwiftUI

/// Manages the configurable sticker/label profiles used by the on-device inventory-number
/// scanner (`StickerScanButton`) — not hardcoded to the seeded "EJB Standard" profile. Profiles
/// are stored server-side and shared across every device/user; anyone can view this list, but
/// creating/editing/deleting requires `settings.manage_sticker_profiles`.
struct StickerProfilesView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = StickerProfilesViewModel()
    @State private var showEditor = false
    @State private var editingProfile: StickerProfile?

    private var canManage: Bool { session.hasPermission("settings.manage_sticker_profiles") }

    var body: some View {
        List {
            Section {
                ForEach(viewModel.profiles) { profile in
                    row(for: profile)
                }
            } footer: {
                Text("Jedes Profil beschreibt eine Aufkleber-Art: Präfix, Trennzeichen, Erkennungsmuster und Beispielbilder zur Kalibrierung. Das Standardprofil greift, wenn kein anderes Profil zum Foto passt.")
            }
        }
        .navigationTitle("Sticker-Profile")
        .toolbar {
            if canManage {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editingProfile = nil
                        showEditor = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .overlay {
            if viewModel.isLoading && viewModel.profiles.isEmpty {
                ProgressView()
            }
        }
        .errorAlert($viewModel.errorMessage)
        .sheet(isPresented: $showEditor) {
            NavigationStack { StickerProfileEditorView(profile: nil) }
        }
        .sheet(item: $editingProfile) { profile in
            NavigationStack { StickerProfileEditorView(profile: profile) }
        }
        .task { await viewModel.load() }
    }

    @ViewBuilder
    private func row(for profile: StickerProfile) -> some View {
        let content = VStack(alignment: .leading, spacing: 4) {
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

        if canManage {
            Button {
                editingProfile = profile
            } label: {
                content
            }
            .tint(.primary)
            .swipeActions(edge: .trailing) {
                Button("Löschen", role: .destructive) {
                    Task { await viewModel.delete(profile) }
                }
                if !profile.isDefault {
                    Button("Als Standard") {
                        Task { await viewModel.makeDefault(profile) }
                    }
                    .tint(.blue)
                }
            }
        } else {
            content
        }
    }
}

#Preview {
    NavigationStack { StickerProfilesView() }
        .environment(AuthSession.shared)
}
