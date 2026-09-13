import SwiftUI

/// The Personen list — browsing/searching users and creating new accounts. Mirrors
/// `InventoryListView`'s structure (a `Destination` enum for `navigationDestination`, a create
/// sheet that pushes to the new record's detail screen on success).
struct UsersListView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = UsersListViewModel()
    @State private var showCreate = false
    @State private var navigationPath = NavigationPath()

    private enum Destination: Hashable {
        case detail(String)
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            content
                .navigationTitle("Personen")
                .searchable(text: $viewModel.searchText, prompt: "Name oder E-Mail-Adresse")
                .toolbar {
                    if session.hasPermission("users.create") {
                        ToolbarItem(placement: .primaryAction) {
                            Button {
                                showCreate = true
                            } label: {
                                Image(systemName: "plus")
                            }
                            .accessibilityIdentifier("users.list.createButton")
                        }
                    }
                }
                .navigationDestination(for: Destination.self) { destination in
                    switch destination {
                    case .detail(let id):
                        UserDetailView(userId: id)
                    }
                }
                .sheet(isPresented: $showCreate) {
                    UserCreateView { newUser in
                        showCreate = false
                        Task { await viewModel.refresh() }
                        navigationPath.append(Destination.detail(newUser.id))
                    }
                }
                .task { await viewModel.onAppear() }
        }
    }

    @ViewBuilder
    private var content: some View {
        let list = viewModel.list
        if list.isLoading && list.items.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if list.items.isEmpty {
            ContentUnavailableView("Keine Personen gefunden", systemImage: "person.2")
        } else {
            List {
                ForEach(list.items) { user in
                    NavigationLink(value: Destination.detail(user.id)) {
                        UserRowView(user: user)
                    }
                    .accessibilityIdentifier("users.list.row.\(user.id)")
                }
                if list.totalPages > 1 {
                    HStack {
                        Button("Zurück") { Task { await list.loadPreviousPage() } }
                            .disabled(!list.hasPreviousPage)
                        Spacer()
                        Text("Seite \(list.page) von \(list.totalPages)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Weiter") { Task { await list.loadNextPage() } }
                            .disabled(!list.hasNextPage)
                    }
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.refresh() }
        }
    }
}

private struct UserRowView: View {
    let user: User

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(user.displayName)
                    .font(.body.weight(.medium))
                if !user.isActive {
                    Text("Inaktiv")
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.secondary.opacity(0.15))
                        .foregroundStyle(.secondary)
                        .clipShape(Capsule())
                }
            }
            Text(user.email)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    UsersListView()
        .environment(AuthSession.shared)
}
