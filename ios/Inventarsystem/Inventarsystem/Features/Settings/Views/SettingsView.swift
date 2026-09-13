import SwiftUI

/// Root Settings menu. Beyond the admin-only `Allgemein`/`E-Mail`/`Backup` pages (gated by
/// `settings.manage`, mirroring the frontend), this is also where the sections that used to be
/// their own bottom tabs now live — Aktivitäten, Artikel, Lager, Benutzer, Rollen, Gruppen und
/// Organisationen — each still gated by its own `*.read` permission. `Sticker-Profile` and the
/// server-address change are iOS-only device/account settings with no frontend equivalent, so
/// they're always available to any signed-in user (editing a sticker profile is separately
/// gated inside `StickerProfilesView` by `settings.manage_sticker_profiles`).
struct SettingsView: View {
    @Environment(AuthSession.self) private var session
    @State private var showChangeServer = false

    private var canManageSettings: Bool { session.hasPermission("settings.manage") }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if session.hasPermission("inventory.read") {
                        NavigationLink {
                            ActivityListView()
                        } label: {
                            Label("Aktivitäten", systemImage: "clock.arrow.circlepath")
                        }
                    }
                    if session.hasPermission("articles.read") {
                        NavigationLink {
                            ArticlesListView()
                        } label: {
                            Label("Artikel", systemImage: "tag")
                        }
                    }
                    if session.hasPermission("locations.read") {
                        NavigationLink {
                            LocationsListView()
                        } label: {
                            Label("Lager", systemImage: "building.2")
                        }
                    }
                    if session.hasPermission("users.read") {
                        NavigationLink {
                            UsersListView()
                        } label: {
                            Label("Benutzer", systemImage: "person.2")
                        }
                    }
                    if session.hasPermission("roles.read") {
                        NavigationLink {
                            RolesListView()
                        } label: {
                            Label("Rollen", systemImage: "checkmark.shield")
                        }
                    }
                    if session.hasPermission("groups.read") {
                        NavigationLink {
                            GroupsListView()
                        } label: {
                            Label("Gruppen", systemImage: "person.3")
                        }
                    }
                    if session.hasPermission("organizations.read") {
                        NavigationLink {
                            OrganizationsListView()
                        } label: {
                            Label("Organisationen", systemImage: "building.2.crop.circle")
                        }
                    }
                }

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
