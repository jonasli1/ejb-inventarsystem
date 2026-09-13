import SwiftUI

/// The Inventar list — the app's most-used screen, and the one that exercises both pagination
/// modes, the shared search picker, and the OCR scan entry point together (see Milestone 4).
struct InventoryListView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = InventoryListViewModel()
    @State private var showCreate = false
    @State private var navigationPath = NavigationPath()

    private enum Destination: Hashable {
        case detail(String)
        case articleUnits(articleName: String, units: [InventoryItem])
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                Picker("Ansicht", selection: $viewModel.isGrouped) {
                    Text("Einzeln").tag(false)
                    Text("Gruppiert").tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.top, 8)

                content
            }
            .navigationTitle("Inventar")
            .searchable(text: $viewModel.searchText, prompt: "Inventarnummer, Artikel, Standort …")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    StickerScanButton { number in
                        viewModel.applyScannedNumber(number)
                    }
                }
                if session.hasPermission("inventory.create") {
                    ToolbarItem(placement: .primaryAction) {
                        Button { showCreate = true } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
            .navigationDestination(for: Destination.self) { destination in
                switch destination {
                case .detail(let id):
                    InventoryDetailView(itemId: id)
                case .articleUnits(let articleName, let units):
                    List(units) { unit in
                        Button {
                            navigationPath.append(Destination.detail(unit.id))
                        } label: {
                            InventoryRowView(item: unit)
                        }
                        .buttonStyle(.plain)
                    }
                    .navigationTitle(articleName)
                }
            }
            .sheet(isPresented: $showCreate) {
                InventoryCreateView { newItem in
                    showCreate = false
                    Task { await viewModel.refresh() }
                    navigationPath.append(Destination.detail(newItem.id))
                }
            }
            .task { await viewModel.onAppear() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isGrouped {
            groupedContent
        } else {
            flatContent
        }
    }

    @ViewBuilder
    private var flatContent: some View {
        let list = viewModel.flatList
        if list.isLoadingInitial && list.items.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if list.items.isEmpty {
            ContentUnavailableView("Keine Inventarobjekte gefunden", systemImage: "shippingbox")
        } else {
            List {
                ForEach(list.items) { item in
                    NavigationLink(value: Destination.detail(item.id)) {
                        InventoryRowView(item: item, searchText: viewModel.searchText)
                    }
                    .task { list.loadMoreIfNeeded(currentItem: item) }
                }
                if list.isLoadingMore {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.refresh() }
        }
    }

    @ViewBuilder
    private var groupedContent: some View {
        let list = viewModel.groupedList
        if list.isLoading && list.items.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if list.items.isEmpty {
            ContentUnavailableView("Keine Artikel gefunden", systemImage: "shippingbox")
        } else {
            List {
                ForEach(list.items) { entry in
                    NavigationLink(value: Destination.articleUnits(articleName: entry.article.name, units: entry.units)) {
                        GroupedInventoryRowView(entry: entry, searchText: viewModel.searchText)
                    }
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

#Preview {
    InventoryListView()
        .environment(AuthSession.shared)
}
