import SwiftUI

/// The "Aktivitäten" feed — merges movement + audit sources into one cursor-paginated timeline,
/// exactly matching the reference frontend's own page (gated by `inventory.read`, not the
/// separate `audit.read`-only `/audit` endpoint the frontend itself never surfaces either).
struct ActivityListView: View {
    @State private var viewModel = ActivityViewModel()
    @State private var showFilters = false

    var body: some View {
        NavigationStack {
            Group {
                let list = viewModel.list
                if list.isLoadingInitial && list.items.isEmpty {
                    ProgressView()
                } else if list.items.isEmpty {
                    ContentUnavailableView("Keine Aktivitäten", systemImage: "clock.arrow.circlepath")
                } else {
                    List {
                        ForEach(list.items) { entry in
                            ActivityRowView(entry: entry)
                                .task { list.loadMoreIfNeeded(currentItem: entry) }
                        }
                        if list.isLoadingMore {
                            ProgressView().frame(maxWidth: .infinity)
                        }
                    }
                    .listStyle(.plain)
                    .refreshable { await viewModel.list.refresh() }
                }
            }
            .navigationTitle("Aktivitäten")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showFilters = true } label: { Image(systemName: "line.3.horizontal.decrease.circle") }
                }
            }
            .sheet(isPresented: $showFilters) {
                ActivityFiltersView(filters: $viewModel.filters)
            }
            .task { await viewModel.onAppear() }
            .errorAlert(Binding(get: { viewModel.list.errorMessage }, set: { _ in }))
        }
    }
}

private struct ActivityRowView: View {
    let entry: ActivityEntry

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(entry.source == .movement ? Color.blue : Color.purple)
                .frame(width: 8, height: 8)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(entry.typeLabel).font(.subheadline.weight(.medium))
                    Spacer()
                    Text(entry.createdAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                Text(entry.description).font(.footnote)
                HStack(spacing: 6) {
                    if let item = entry.inventoryItem {
                        Text(item.inventoryNumber ?? item.article.name)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if let user = entry.user {
                        Text("· \(user.displayName)").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 3)
    }
}

private struct ActivityFiltersView: View {
    @Binding var filters: ActivityFilters
    @Environment(\.dismiss) private var dismiss

    @State private var selectedArticle: ArticleListItem?
    @State private var selectedUser: User?
    @State private var loanId = ""
    @State private var showArticlePicker = false
    @State private var showUserPicker = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Artikel") {
                    Button(selectedArticle?.article.name ?? "Alle") { showArticlePicker = true }
                }
                Section("Benutzer") {
                    Button(selectedUser?.displayName ?? "Alle") { showUserPicker = true }
                }
                Section("Art") {
                    Picker("Art", selection: $filters.movementType) {
                        Text("Alle").tag(String?.none)
                        Text("Zugang").tag(String?.some("in"))
                        Text("Abgang").tag(String?.some("out"))
                        Text("Umlagerung").tag(String?.some("move"))
                        Text("Anpassung").tag(String?.some("adjust"))
                        Text("Statusänderung").tag(String?.some("status_change"))
                        Text("Zustandsänderung").tag(String?.some("condition_change"))
                    }
                }
                Section("Ausleihe-ID") {
                    TextField("Ausleihe-ID einfügen", text: $loanId)
                        .autocorrectionDisabled()
                }
                Section {
                    Picker("Sortierung", selection: $filters.sortAscending) {
                        Text("Neueste zuerst").tag(false)
                        Text("Älteste zuerst").tag(true)
                    }
                }
            }
            .navigationTitle("Filter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") {
                        filters.articleId = selectedArticle?.id
                        filters.userId = selectedUser?.id
                        filters.loanId = loanId.isEmpty ? nil : loanId
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showArticlePicker) {
                NavigationStack {
                    AsyncSearchPicker<ArticleListItem>(
                        placeholder: "Artikel suchen",
                        search: { query in (try? await ArticleService().search(query: query, categoryId: nil, page: 1, pageSize: 20).items) ?? [] },
                        onSelect: { article in selectedArticle = article; showArticlePicker = false }
                    )
                    .navigationTitle("Artikel")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { showArticlePicker = false } } }
                }
            }
            .sheet(isPresented: $showUserPicker) {
                NavigationStack {
                    AsyncSearchPicker<User>(
                        placeholder: "Person suchen",
                        search: { query in (try? await UserService().fetchAll(search: query, page: 1, pageSize: 20).items) ?? [] },
                        onSelect: { user in selectedUser = user; showUserPicker = false }
                    )
                    .navigationTitle("Benutzer")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { showUserPicker = false } } }
                }
            }
        }
    }
}

#Preview {
    ActivityListView()
        .environment(AuthSession.shared)
}
