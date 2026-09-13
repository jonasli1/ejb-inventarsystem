import SwiftUI

/// Create form for a new Artikel — same fields as `ArticleDetailView`'s edit form, minus
/// attachments (photo/documents need an existing Artikel id first).
struct ArticleCreateView: View {
    var onCreated: (Article) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = ArticleCreateViewModel()

    var body: some View {
        NavigationStack {
            Form {
                Section("Allgemein") {
                    TextField("Name", text: $viewModel.name)
                        .accessibilityIdentifier("articles.create.nameField")
                    Picker("Kategorie", selection: $viewModel.categoryId) {
                        Text("Keine Kategorie").tag(String?.none)
                        ForEach(viewModel.categories) { category in
                            Text(category.name).tag(String?.some(category.id))
                        }
                    }
                    TextField("Hersteller", text: $viewModel.manufacturer)
                    TextField("Maßeinheit", text: $viewModel.unitOfMeasure)
                }

                Section("Beschreibung") {
                    TextEditor(text: $viewModel.description)
                        .frame(minHeight: 80)
                }

                Section("Notizen") {
                    TextEditor(text: $viewModel.notes)
                        .frame(minHeight: 80)
                }

                Section("Aliase (Kosenamen)") {
                    AliasEditorView(aliases: $viewModel.aliases)
                }
            }
            .navigationTitle("Neuer Artikel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSaving {
                        ProgressView()
                    } else {
                        Button("Speichern") {
                            Task {
                                if let created = await viewModel.save() {
                                    onCreated(created)
                                }
                            }
                        }
                        .disabled(!viewModel.canSave)
                        .accessibilityIdentifier("articles.create.saveButton")
                    }
                }
            }
            .errorAlert($viewModel.errorMessage)
            .task { await viewModel.loadPickerData() }
        }
    }
}

#Preview {
    ArticleCreateView { _ in }
        .environment(AuthSession.shared)
}
