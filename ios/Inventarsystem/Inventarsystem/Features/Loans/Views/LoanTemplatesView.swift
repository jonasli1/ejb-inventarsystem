import SwiftUI

/// Full management screen (Einstellungen-reachable, `loans.administer`-gated for creation) —
/// list existing Vorlagen, create new ones from Artikel+Menge, delete.
struct LoanTemplatesView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = LoanTemplatesViewModel()
    @State private var showCreate = false

    var body: some View {
        List {
            if viewModel.templates.isEmpty && !viewModel.isLoading {
                ContentUnavailableView("Keine Vorlagen", systemImage: "doc.on.doc")
            }
            ForEach(viewModel.templates) { template in
                VStack(alignment: .leading, spacing: 4) {
                    Text(template.name).font(.headline)
                    Text(template.items.map { "\($0.article.name) × \($0.quantity)" }.joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .swipeActions {
                    if session.hasPermission("loans.administer") {
                        Button(role: .destructive) { Task { await viewModel.delete(template) } } label: {
                            Label("Löschen", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .navigationTitle("Ausleihe-Vorlagen")
        .toolbar {
            if session.hasPermission("loans.administer") {
                ToolbarItem(placement: .primaryAction) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                }
            }
        }
        .task { await viewModel.load() }
        .errorAlert($viewModel.errorMessage)
        .sheet(isPresented: $showCreate) {
            LoanTemplateCreateView { name, notes, items in
                showCreate = false
                Task { await viewModel.create(name: name, notes: notes, items: items) }
            }
        }
    }
}

private struct LoanTemplateCreateView: View {
    var onSave: (String, String, [LoanTemplateItemInput]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var notes = ""
    @State private var items: [(article: ArticleListItem, quantity: Int)] = []
    @State private var showArticlePicker = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Vorlage") {
                    TextField("Name", text: $name)
                    TextField("Notizen", text: $notes)
                }
                Section("Artikel") {
                    ForEach(items, id: \.article.id) { entry in
                        Text("\(entry.article.article.name) × \(entry.quantity)")
                    }
                    Button { showArticlePicker = true } label: {
                        Label("Artikel hinzufügen", systemImage: "plus")
                    }
                }
            }
            .navigationTitle("Neue Vorlage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") {
                        onSave(name, notes, items.map { LoanTemplateItemInput(articleId: $0.article.id, quantity: $0.quantity) })
                    }
                    .disabled(name.isEmpty || items.isEmpty)
                }
            }
            .sheet(isPresented: $showArticlePicker) {
                NavigationStack {
                    AsyncSearchPicker<ArticleListItem>(
                        placeholder: "Artikel suchen",
                        search: { query in (try? await ArticleService().search(query: query, categoryId: nil, page: 1, pageSize: 20).items) ?? [] },
                        onSelect: { article in
                            showArticlePicker = false
                            items.append((article, 1))
                        }
                    )
                    .navigationTitle("Artikel auswählen")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { showArticlePicker = false } }
                    }
                }
            }
        }
    }
}

/// Lightweight picker variant used from the loan-create flow ("Aus Vorlage erstellen").
struct LoanTemplatePickerView: View {
    var onSelect: (LoanTemplate) -> Void

    @State private var viewModel = LoanTemplatesViewModel()

    var body: some View {
        NavigationStack {
            List(viewModel.templates) { template in
                Button {
                    onSelect(template)
                } label: {
                    VStack(alignment: .leading) {
                        Text(template.name)
                        Text(template.items.map { "\($0.article.name) × \($0.quantity)" }.joined(separator: ", "))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Vorlage wählen")
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
        }
    }
}
