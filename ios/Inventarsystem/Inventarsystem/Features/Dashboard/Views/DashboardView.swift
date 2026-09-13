import SwiftUI

/// Mirrors the frontend's `DashboardPage`: permission-gated stat tiles (Inventar/Artikel/
/// Ausleihen/Organisationen) plus a small account-info card. This is also the app's only
/// entry point to the Profil screen (top-right toolbar button) — Profil is deliberately not a
/// bottom-tab destination, per the shell's design.
///
/// A tile tap either switches the shell's selected tab (Inventar/Ausleihe, still tabs) via
/// `onSelectTile`, or pushes locally onto this screen's own `NavigationStack` (Artikel/
/// Organisationen, which live inside "Einstellungen" now and aren't tabs anymore).
struct DashboardView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = DashboardViewModel()
    @State private var showProfile = false
    @State private var pushedDestination: DashboardViewModel.Destination?
    var onSelectTile: (DashboardViewModel.Destination) -> Void = { _ in }

    /// Fixed tile height so the grid's rows line up regardless of label length or whether a
    /// tile shows a number or the "Bestand ansehen" placeholder.
    private static let tileHeight: CGFloat = 84

    private let columns = [GridItem(.adaptive(minimum: 160), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Willkommen, \(session.profile?.displayName ?? "")")
                            .font(.title2.bold())
                        Text("Überblick über dein Inventar- und Lagerverwaltungssystem.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    if viewModel.isLoading {
                        ProgressView().frame(maxWidth: .infinity)
                    } else if viewModel.tiles.isEmpty {
                        Text("Für dein Konto sind aktuell keine Übersichtsdaten verfügbar.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(viewModel.tiles) { tile in
                                Button {
                                    select(tile.id)
                                } label: {
                                    statTile(tile)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if let profile = session.profile {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Dein Konto").font(.headline)
                            LabeledContent("E-Mail", value: profile.email)
                            LabeledContent("Rollen", value: joined(profile.roles.map(\.name)))
                            LabeledContent("Anmeldemethoden", value: joined(profile.authMethods))
                            LabeledContent("Gruppen", value: joined(profile.groups.map(\.name)))
                        }
                        .padding()
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Dashboard")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showProfile = true
                    } label: {
                        Image(systemName: "person.crop.circle")
                    }
                    .accessibilityLabel("Profil")
                    .accessibilityIdentifier("dashboard.profileButton")
                }
            }
            .navigationDestination(item: $pushedDestination) { destination in
                switch destination {
                case .articles: ArticlesListView()
                case .organizations: OrganizationsListView()
                case .inventory, .loans: EmptyView()
                }
            }
            .sheet(isPresented: $showProfile) {
                ProfileView()
            }
            .task { await viewModel.load() }
        }
    }

    private func select(_ destination: DashboardViewModel.Destination) {
        switch destination {
        case .inventory, .loans:
            onSelectTile(destination)
        case .articles, .organizations:
            pushedDestination = destination
        }
    }

    private func joined(_ values: [String]) -> String {
        values.isEmpty ? "–" : values.joined(separator: ", ")
    }

    private func statTile(_ tile: DashboardViewModel.StatTile) -> some View {
        HStack(spacing: 12) {
            Image(systemName: tile.systemImage)
                .font(.system(size: 18))
                .foregroundStyle(Color.accentColor)
                .frame(width: 40, height: 40)
                .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                if let value = tile.value {
                    Text("\(value)").font(.title3.bold())
                } else {
                    Text("Bestand ansehen").font(.subheadline.weight(.semibold))
                }
                Text(tile.label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: Self.tileHeight, maxHeight: Self.tileHeight, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    DashboardView()
        .environment(AuthSession.shared)
}
