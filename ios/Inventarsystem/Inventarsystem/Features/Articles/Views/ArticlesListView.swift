import SwiftUI

/// The Artikel catalog list — the reference frontend's separate `/articles` page (distinct from
/// the Inventar list, which lists physical units). Small thumbnails are appropriate here (unlike
/// `InventoryRowView`, which stays deliberately image-free for scale reasons): there are far
/// fewer distinct Artikel than Inventarobjekte in practice.
struct ArticlesListView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = ArticlesListViewModel()
    @State private var showCreate = false
    @State private var showCategoryManagement = false
    @State private var navigationPath = NavigationPath()

    private enum Destination: Hashable {
        case detail(String)
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                categoryFilter
                content
            }
            .navigationTitle("Artikel")
            .searchable(text: $viewModel.searchText, prompt: "Name, Hersteller, Alias …")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showCategoryManagement = true
                    } label: {
                        Image(systemName: "tag")
                    }
                    .accessibilityIdentifier("articles.list.manageCategoriesButton")
                    .accessibilityLabel("Kategorien verwalten")
                }
                if session.hasPermission("articles.create") {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showCreate = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityIdentifier("articles.list.addButton")
                    }
                }
            }
            .navigationDestination(for: Destination.self) { destination in
                switch destination {
                case .detail(let id):
                    ArticleDetailView(articleId: id)
                }
            }
            .sheet(isPresented: $showCreate) {
                ArticleCreateView { created in
                    showCreate = false
                    Task { await viewModel.refresh() }
                    navigationPath.append(Destination.detail(created.id))
                }
            }
            .sheet(isPresented: $showCategoryManagement) {
                CategoryManagementView()
            }
            .task { await viewModel.onAppear() }
        }
    }

    @ViewBuilder
    private var categoryFilter: some View {
        if !viewModel.categories.isEmpty {
            Picker("Kategorie", selection: $viewModel.categoryId) {
                Text("Alle Kategorien").tag(String?.none)
                ForEach(viewModel.categories) { category in
                    Text(category.name).tag(String?.some(category.id))
                }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)
            .padding(.top, 8)
            .accessibilityIdentifier("articles.list.categoryFilterPicker")
        }
    }

    @ViewBuilder
    private var content: some View {
        let list = viewModel.list
        if list.isLoading && list.items.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if list.items.isEmpty {
            ContentUnavailableView("Keine Artikel gefunden", systemImage: "shippingbox")
        } else {
            List {
                ForEach(list.items) { item in
                    NavigationLink(value: Destination.detail(item.id)) {
                        ArticleRowView(item: item)
                    }
                    .task { list.loadNextAppendingIfNeeded(currentItem: item) }
                }
                if list.isLoadingMore {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.refresh() }
        }
    }
}

private struct ArticleRowView: View {
    let item: ArticleListItem

    var body: some View {
        HStack(spacing: 12) {
            ArticleThumbnailView(articleId: item.id, size: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.article.name).font(.body.weight(.medium))
                if !subtitle.isEmpty {
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var subtitle: String {
        [item.article.manufacturer, item.category?.name]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }
}

/// Fetches and shows an Artikel's current product photo thumbnail — one lightweight
/// `AttachmentService.list` call per row (feasible since there are far fewer distinct Artikel
/// than Inventarobjekte; `InventoryRowView` stays deliberately thumbnail-free for that reason).
/// Never loads the medium/original image from a list row, per the app's lazy-loading rule.
#Preview {
    ArticlesListView()
        .environment(AuthSession.shared)
}
