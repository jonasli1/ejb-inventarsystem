import SwiftUI

struct LoanCreateView: View {
    /// Pass an existing loan to edit it in place; omit to create a new one.
    var existingLoan: Loan?
    var onCreated: (Loan) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(AuthSession.self) private var session
    @State private var viewModel = LoanCreateViewModel()
    @State private var showItemPicker = false
    @State private var showArticlePicker = false
    @State private var showTemplatePicker = false
    @State private var pendingArticle: ArticleListItem?
    @State private var pendingQuantity = 1

    private var isEditing: Bool { existingLoan != nil }

    private var canManage: Bool { session.hasAnyPermission(["loans.manage", "loans.administer"]) }
    private var canAdminister: Bool { session.hasPermission("loans.administer") }

    var body: some View {
        NavigationStack {
            Form {
                Section("Ausleiher") {
                    TextField("Name", text: $viewModel.borrowerName)
                    TextField("Straße", text: $viewModel.borrowerStreet)
                    TextField("Ort", text: $viewModel.borrowerCity)
                    TextField("E-Mail-Adresse", text: $viewModel.borrowerEmail)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    TextField("Telefon", text: $viewModel.borrowerPhone)
                        .keyboardType(.phonePad)
                }

                Section("Zeitraum") {
                    DatePicker("Ausgabedatum", selection: $viewModel.checkoutDate, displayedComponents: .date)
                    DatePicker("Rückgabedatum", selection: $viewModel.dueDate, displayedComponents: .date)
                }

                Section("Objekte") {
                    ForEach(viewModel.lines) { line in
                        HStack {
                            if line.isAccessory {
                                Image(systemName: "arrow.turn.down.right").foregroundStyle(.secondary).font(.caption)
                            }
                            VStack(alignment: .leading) {
                                HStack(spacing: 4) {
                                    Text(line.displayTitle)
                                    if line.isAccessory {
                                        Text("Zubehör")
                                            .font(.caption2.weight(.medium))
                                            .padding(.horizontal, 6).padding(.vertical, 2)
                                            .background(Color.blue.opacity(0.15))
                                            .foregroundStyle(.blue)
                                            .clipShape(Capsule())
                                    }
                                }
                                Text(line.displaySubtitle).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(role: .destructive) { viewModel.removeLine(line) } label: {
                                Image(systemName: "minus.circle")
                            }
                        }
                    }
                    Button { showItemPicker = true } label: {
                        Label("Bestimmtes Objekt hinzufügen", systemImage: "plus")
                    }
                    Button { showArticlePicker = true } label: {
                        Label("Artikel nach Menge hinzufügen", systemImage: "plus.square.on.square")
                    }
                    if !session.publicConfig.displayName.isEmpty {
                        Button { showTemplatePicker = true } label: {
                            Label("Aus Vorlage erstellen", systemImage: "doc.on.doc")
                        }
                    }
                }

                Section("Notizen") {
                    TextEditor(text: $viewModel.notes).frame(minHeight: 60)
                }

                if canManage {
                    Section {
                        Toggle("Trotz Berechtigung nur als „beantragt“ anlegen", isOn: $viewModel.forceRequested)
                        if canAdminister {
                            TextField("Als Vorlage speichern unter (optional)", text: $viewModel.saveAsTemplateName)
                        }
                    }
                }
            }
            .navigationTitle(isEditing ? "Ausleihe bearbeiten" : "Neue Ausleihe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSaving {
                        ProgressView()
                    } else {
                        Button(isEditing ? "Speichern" : "Anlegen") {
                            Task {
                                if let loan = await viewModel.save() { onCreated(loan) }
                            }
                        }
                        .disabled(!viewModel.canSave)
                    }
                }
            }
            .errorAlert($viewModel.errorMessage)
            .onAppear {
                if let existingLoan, viewModel.borrowerStreet.isEmpty {
                    viewModel.seed(from: existingLoan)
                }
            }
            .sheet(isPresented: $showItemPicker) {
                NavigationStack {
                    AsyncSearchPicker<InventoryItem>(
                        placeholder: "Inventarnummer, Artikel …",
                        search: { query in await viewModel.itemSearch(query) },
                        onSelect: { item in
                            showItemPicker = false
                            Task { await viewModel.addSpecificItem(item) }
                        },
                        enableStickerScan: true
                    )
                    .navigationTitle("Objekt auswählen")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { showItemPicker = false } }
                    }
                }
            }
            .sheet(item: $pendingArticle) { article in
                NavigationStack {
                    Form {
                        Stepper("Menge: \(pendingQuantity)", value: $pendingQuantity, in: 1...99)
                    }
                    .navigationTitle(article.article.name)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Abbrechen") { pendingArticle = nil }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Hinzufügen") {
                                viewModel.addArticleQuantity(article.article, quantity: pendingQuantity)
                                pendingArticle = nil
                                pendingQuantity = 1
                            }
                        }
                    }
                }
                .presentationDetents([.medium])
            }
            .sheet(isPresented: $showArticlePicker) {
                NavigationStack {
                    AsyncSearchPicker<ArticleListItem>(
                        placeholder: "Artikel suchen",
                        search: { query in
                            (try? await ArticleService().search(query: query, categoryId: nil, page: 1, pageSize: 20).items) ?? []
                        },
                        onSelect: { article in
                            showArticlePicker = false
                            pendingArticle = article
                        }
                    )
                    .navigationTitle("Artikel auswählen")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { showArticlePicker = false } }
                    }
                }
            }
            .sheet(isPresented: $showTemplatePicker) {
                LoanTemplatePickerView { template in
                    showTemplatePicker = false
                    viewModel.applyTemplate(template)
                }
            }
        }
    }
}
