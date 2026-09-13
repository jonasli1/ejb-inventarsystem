import SwiftUI

/// One stable identity per section, used as the `TabView` selection so Dashboard tile taps can
/// jump to a section (see `onSelectTile` below) and so the same declaration adapts to both
/// idioms: a tab bar with automatic "Weitere"/More overflow on iPhone, a sidebar on iPad —
/// `TabView(selection:)` + `.tabViewStyle(.sidebarAdaptable)` (iOS 18+) render one section list
/// as whichever is appropriate for the current size class, no manual branching needed.
private enum ShellDestination: Hashable {
    case dashboard, inventory, articles, locations, loans, calendar, activity
    case users, roles, groups, organizations
    case settings, profile
}

/// The authenticated app's navigation shell — every top-level feature list view already wraps
/// itself in its own `NavigationStack`, so sections are embedded directly, matching how the
/// Milestone-1 placeholder already used `InventoryListView()` bare.
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
            if session.hasPermission("articles.read") {
                Tab("Artikel", systemImage: "tag", value: ShellDestination.articles) {
                    ArticlesListView()
                }
            }
            if session.hasPermission("locations.read") {
                Tab("Lager", systemImage: "building.2", value: ShellDestination.locations) {
                    LocationsListView()
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
            if session.hasPermission("inventory.read") {
                Tab("Aktivitäten", systemImage: "clock.arrow.circlepath", value: ShellDestination.activity) {
                    ActivityListView()
                }
            }

            // Grouped into one `TabSection` (rather than 4 more top-level `Tab`s) to stay under
            // `TabContentBuilder`'s 10-child `buildBlock` limit — this single declaration would
            // otherwise have 13 direct children and fail to type-check.
            TabSection("Verwaltung") {
                if session.hasPermission("users.read") {
                    Tab("Benutzer", systemImage: "person.2", value: ShellDestination.users) {
                        UsersListView()
                    }
                }
                if session.hasPermission("roles.read") {
                    Tab("Rollen", systemImage: "checkmark.shield", value: ShellDestination.roles) {
                        RolesListView()
                    }
                }
                if session.hasPermission("groups.read") {
                    Tab("Gruppen", systemImage: "person.3", value: ShellDestination.groups) {
                        GroupsListView()
                    }
                }
                if session.hasPermission("organizations.read") {
                    Tab("Organisationen", systemImage: "building.2.crop.circle", value: ShellDestination.organizations) {
                        OrganizationsListView()
                    }
                }
            }

            Tab("Einstellungen", systemImage: "gearshape", value: ShellDestination.settings) {
                SettingsView()
            }

            Tab("Profil", systemImage: "person.crop.circle", value: ShellDestination.profile) {
                ProfileView()
            }
        }
        .tabViewStyle(.sidebarAdaptable)
    }

    private func jump(to destination: DashboardViewModel.Destination) {
        switch destination {
        case .inventory: selection = .inventory
        case .articles: selection = .articles
        case .loans: selection = .loans
        case .organizations: selection = .organizations
        }
    }
}

#Preview {
    AppShellView()
        .environment(AuthSession.shared)
}
