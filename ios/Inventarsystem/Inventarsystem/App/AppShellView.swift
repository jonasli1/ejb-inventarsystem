import SwiftUI

/// One stable identity per bottom-tab destination, used as the `TabView` selection so Dashboard
/// tile taps can jump to a tab (see `jump(to:)` below) and so the same declaration adapts to
/// both idioms via `.tabViewStyle(.sidebarAdaptable)` (iOS 18+): a tab bar on iPhone, a sidebar
/// on iPad. Only 5 destinations now (Dashboard/Inventar/Ausleihe/Kalender/Einstellungen) — every
/// other section (Artikel, Lager, Aktivitäten, Benutzer, Rollen, Gruppen, Organisationen,
/// Allgemein, E-Mail, Backup, Sticker-Profile) lives inside "Einstellungen"; Profil is reachable
/// only via the person-icon button on the Dashboard, not as a tab.
private enum ShellDestination: Hashable {
    case dashboard, inventory, loans, calendar, settings
}

/// The authenticated app's navigation shell — every top-level feature list view already wraps
/// itself in its own `NavigationStack`, so sections are embedded directly.
struct AppShellView: View {
    @Environment(AuthSession.self) private var session
    @State private var selection: ShellDestination = .dashboard

    var body: some View {
        TabView(selection: $selection) {
            Tab("Dashboard", systemImage: "house", value: ShellDestination.dashboard) {
                DashboardView(onSelectTile: jump(to:))
            }

            if session.hasPermission("inventory.read") {
                Tab("Inventar", systemImage: "shippingbox", value: ShellDestination.inventory) {
                    InventoryListView()
                }
            }
            if session.hasAnyPermission(["loans.create", "loans.read", "loans.manage", "loans.spend", "loans.administer"]) {
                Tab("Ausleihe", systemImage: "arrow.left.arrow.right", value: ShellDestination.loans) {
                    LoansListView()
                }
            }
            if session.hasAnyPermission(["loans.read", "loans.manage", "loans.spend", "loans.administer"]) {
                Tab("Kalender", systemImage: "calendar", value: ShellDestination.calendar) {
                    LoanCalendarView()
                }
            }

            Tab("Einstellungen", systemImage: "gearshape", value: ShellDestination.settings) {
                SettingsView()
            }
        }
        .tabViewStyle(.sidebarAdaptable)
    }

    private func jump(to destination: DashboardViewModel.Destination) {
        switch destination {
        case .inventory: selection = .inventory
        case .loans: selection = .loans
        case .articles, .organizations: break // handled locally by DashboardView's own push navigation
        }
    }
}

#Preview {
    AppShellView()
        .environment(AuthSession.shared)
}
