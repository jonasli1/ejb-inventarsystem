import SwiftUI

/// Root Settings menu. `Allgemein`/`E-Mail`/`Backup` mirror the frontend's admin-only settings
/// pages (all gated by the single `settings.manage` permission); `Sticker-Profile` and the
/// server-address change are iOS-only device/account settings with no frontend equivalent, so
/// they're always available to any signed-in user.
struct SettingsView: View {
    @Environment(AuthSession.self) private var session
    @State private var showChangeServer = false

    private var canManageSettings: Bool { session.hasPermission("settings.manage") }

    var body: some View {
        NavigationStack {
            List {
                if canManageSettings {
                    Section {
                        NavigationLink {
                            GeneralSettingsView()
                        } label: {
                            Label("Allgemein", systemImage: "slider.horizontal.3")
                        }
                        NavigationLink {
                            EmailSettingsView()
                        } label: {
                            Label("E-Mail", systemImage: "envelope")
                        }
                        NavigationLink {
                            BackupSettingsView()
                        } label: {
                            Label("Backup", systemImage: "externaldrive.badge.timemachine")
                        }
                    }
                }

                Section {
                    NavigationLink {
                        StickerProfilesView()
                    } label: {
                        Label("Sticker-Profile", systemImage: "camera.viewfinder")
                    }
                } footer: {
                    Text("Konfiguriert, wie die App Inventarnummern von Aufklebern per Kamera erkennt.")
                }

                Section {
                    Button {
                        showChangeServer = true
                    } label: {
                        Label("Server-Adresse ändern", systemImage: "server.rack")
                    }
                } footer: {
                    Text("Aktueller Server: \(APIConfiguration.baseURL?.absoluteString ?? "–")")
                }
            }
            .navigationTitle("Einstellungen")
        }
        .fullScreenCover(isPresented: $showChangeServer) {
            OnboardingView(isChangingExistingServer: true, onCancel: { showChangeServer = false })
        }
    }
}

#Preview {
    SettingsView()
        .environment(AuthSession.shared)
}
