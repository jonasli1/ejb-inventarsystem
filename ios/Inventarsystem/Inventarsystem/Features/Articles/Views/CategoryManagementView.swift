import SwiftUI

/// Kategorien-Verwaltung — a simple CRUD screen for the Artikel category tree, opened from
/// `ArticlesListView`'s toolbar. Categories share the Artikel permission keys per the backend, so
/// create/edit/delete are gated the same way an Artikel's own fields are; reading the tree itself
/// only needs the implicit `articles.read`, so the screen stays reachable (read-only) for anyone.
struct CategoryManagementView: View {
    @Environment(AuthSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = CategoryManagementViewModel()
    @State private var categoryPendingDelete: Category?

    private var canCreate: Bool { session.hasPermission("articles.create") }
    private var canUpdate: Bool { session.hasPermission("articles.update") }
    private var canDelete: Bool { session.hasPermission("articles.delete") }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.categories.isEmpty {
                    ProgressView()
                } else if viewModel.categories.isEmpty {
                    ContentUnavailableView("Keine Kategorien", systemImage: "tag")
                } else {
                    List {
                        OutlineGroup(viewModel.rootNodes, children: \.children) { node in
                            categoryRow(node.category)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Kategorien")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fertig") { dismiss() }
                }
                if canCreate {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            viewModel.beginCreating()
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityIdentifier("articles.categories.addButton")
                    }
                }
            }
            .task { await viewModel.load() }
            .errorAlert($viewModel.errorMessage)
            .sheet(isPresented: $viewModel.isPresentingForm) {
                CategoryFormView(viewModel: viewModel)
            }
            .confirmationDialog(
                "Kategorie „\(categoryPendingDelete?.name ?? "")“ wirklich löschen?",
                isPresented: Binding(
                    get: { categoryPendingDelete != nil },
                    set: { isPresented in if !isPresented { categoryPendingDelete = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Löschen", role: .destructive) {
                    if let category = categoryPendingDelete {
                        Task { await viewModel.delete(category) }
                    }
                    categoryPendingDelete = nil
                }
                Button("Abbrechen", role: .cancel) { categoryPendingDelete = nil }
            }
        }
    }

    @ViewBuilder
    private func categoryRow(_ category: Category) -> some View {
        HStack {
            Text(category.name)
            Spacer()
            if canUpdate {
                Button {
                    viewModel.beginEditing(category)
                } label: {
                    Image(systemName: "pencil")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Kategorie „\(category.name)“ bearbeiten")
            }
            if canDelete {
                Button(role: .destructive) {
                    categoryPendingDelete = category
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Kategorie „\(category.name)“ löschen")
            }
        }
    }
}

/// The create/edit sheet shared by both flows — `viewModel.editingCategory == nil` distinguishes
/// create vs. edit, same as the reference frontend's single category form modal. `@Bindable`
/// (rather than the plain `$viewModel.field`-via-`@State` pattern used where a view owns its own
/// view model) because this view *receives* the already-`@State`-owned instance as a parameter.
private struct CategoryFormView: View {
    @Bindable var viewModel: CategoryManagementViewModel

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $viewModel.formName)
                    .accessibilityIdentifier("articles.categories.nameField")
                Picker("Übergeordnete Kategorie", selection: $viewModel.formParentId) {
                    Text("Keine (oberste Ebene)").tag(String?.none)
                    ForEach(viewModel.availableParents) { category in
                        Text(category.name).tag(String?.some(category.id))
                    }
                }
            }
            .navigationTitle(viewModel.editingCategory == nil ? "Neue Kategorie" : "Kategorie bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { viewModel.isPresentingForm = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSaving {
                        ProgressView()
                    } else {
                        Button("Speichern") { Task { await viewModel.saveForm() } }
                            .disabled(!viewModel.canSaveForm)
                            .accessibilityIdentifier("articles.categories.saveButton")
                    }
                }
            }
            .errorAlert($viewModel.errorMessage)
        }
    }
}

#Preview {
    CategoryManagementView()
        .environment(AuthSession.shared)
}
