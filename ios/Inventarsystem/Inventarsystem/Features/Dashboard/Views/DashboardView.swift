import SwiftUI

/// Mirrors the frontend's `DashboardPage`: permission-gated stat tiles (Inventar/Artikel/
/// Ausleihen/Organisationen) plus a small account-info card. Tile taps are reported upward via
/// `onSelectTile` rather than navigating directly, since which section a tap should jump to is a
/// shell-level concern (switch tabs on iPhone, change the sidebar selection on iPad).
struct DashboardView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = DashboardViewModel()
    var onSelectTile: (DashboardViewModel.Destination) -> Void = { _ in }

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
                                    onSelectTile(tile.id)
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
            .task { await viewModel.load() }
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
                Text(tile.label).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    DashboardView()
        .environment(AuthSession.shared)
}
