import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Shows/edits one Artikel: fields, its single product photo, its Dokumente, and every physical
/// Inventarobjekt referencing it — mirrors `InventoryDetailView`'s tab layout exactly.
struct ArticleDetailView: View {
    let articleId: String

    @Environment(AuthSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: ArticleDetailViewModel
    @State private var tab: Tab = .overview
    @State private var showDeleteConfirm = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showDocumentImporter = false

    private enum Tab: String, CaseIterable { case overview = "Übersicht", documents = "Dokumente", units = "Objekte" }

    init(articleId: String) {
        self.articleId = articleId
        _viewModel = State(initialValue: ArticleDetailViewModel(articleId: articleId))
    }

    private var canUpdate: Bool { session.hasPermission("articles.update") }
    private var canDelete: Bool { session.hasPermission("articles.delete") }

    var body: some View {
        Group {
            if let article = viewModel.article {
                content(for: article)
            } else if viewModel.isLoading {
                ProgressView()
            } else {
                ContentUnavailableView("Artikel nicht gefunden", systemImage: "questionmark.folder")
            }
        }
        .navigationTitle(viewModel.article?.name ?? "Artikel")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.errorMessage)
        .onChange(of: viewModel.isDeleted) { _, deleted in if deleted { dismiss() } }
    }

    @ViewBuilder
    private func content(for article: Article) -> some View {
        VStack(spacing: 0) {
            Picker("Ansicht", selection: $tab) {
                ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding()

            ScrollView {
                switch tab {
                case .overview: overviewTab(article)
                case .documents: documentsTab
                case .units: unitsTab
                }
            }
        }
        .toolbar {
            if tab == .overview && canUpdate {
                ToolbarItem(placement: .primaryAction) {
                    if viewModel.isEditing {
                        Button("Fertig") {
                            Task { _ = await viewModel.saveEdits() }
                        }
                        .disabled(!viewModel.canSave)
                        .accessibilityIdentifier("articles.detail.saveButton")
                    } else {
                        Button("Bearbeiten") { Task { await viewModel.beginEditing() } }
                            .accessibilityIdentifier("articles.detail.editButton")
                    }
                }
            }
        }
    }

    // MARK: - Übersicht

    @ViewBuilder
    private func overviewTab(_ article: Article) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            photoSection

            if viewModel.isEditing {
                editForm()
            } else {
                readOnlyOverview(article)
            }

            if canDelete && !viewModel.isEditing {
                Button("Artikel löschen", role: .destructive) { showDeleteConfirm = true }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
                    .accessibilityIdentifier("articles.detail.deleteButton")
            }
        }
        .padding()
        .confirmationDialog(
            "Artikel „\(article.name)“ endgültig löschen? Dies kann nicht rückgängig gemacht werden.",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Endgültig löschen", role: .destructive) { Task { await viewModel.delete() } }
            Button("Abbrechen", role: .cancel) {}
        }
    }

    private var photoSection: some View {
        // Read the MainActor-isolated view model property into a plain, Sendable local first:
        // `PhotosPicker`'s `label` closure below is inferred as `@Sendable`, so referencing
        // `viewModel.photoAttachment` directly from inside it trips a "main actor-isolated
        // property can not be referenced from a Sendable closure" warning (verified via
        // `swiftc -typecheck`, matching this project's `SWIFT_APPROACHABLE_CONCURRENCY` setting).
        let hasPhoto = viewModel.photoAttachment != nil

        return VStack(alignment: .leading, spacing: 8) {
            Text("Produktfoto").font(.subheadline.weight(.semibold))

            if let photoURL = viewModel.photoAttachment?.resolvedMediumURL {
                AuthenticatedAsyncImage(url: photoURL) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                }
                .frame(maxWidth: .infinity, maxHeight: 200)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                ContentUnavailableView("Kein Foto", systemImage: "photo")
                    .frame(maxWidth: .infinity)
                    .frame(height: 120)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            if canUpdate {
                PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                    Label(hasPhoto ? "Foto ersetzen" : "Foto hinzufügen", systemImage: "photo.badge.plus")
                }
                .font(.footnote)
                .disabled(viewModel.isUploadingPhoto)
                .accessibilityIdentifier("articles.detail.uploadPhotoButton")
                if viewModel.isUploadingPhoto {
                    ProgressView()
                }
            }
        }
        .onChange(of: selectedPhotoItem) { _, newItem in
            guard let newItem else { return }
            Task {
                defer { selectedPhotoItem = nil }
                guard let data = try? await newItem.loadTransferable(type: Data.self) else { return }
                let type = newItem.supportedContentTypes.first
                let mimeType = type?.preferredMIMEType ?? "image/jpeg"
                let fileExtension = type?.preferredFilenameExtension ?? "jpg"
                await viewModel.uploadPhoto(fileName: "produktfoto.\(fileExtension)", mimeType: mimeType, data: data)
            }
        }
    }

    private func readOnlyOverview(_ article: Article) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            LabeledContent("Name", value: article.name)
            LabeledContent("Kategorie", value: viewModel.category?.name ?? "—")
            LabeledContent("Hersteller", value: nonEmpty(article.manufacturer))
            LabeledContent("Maßeinheit", value: nonEmpty(article.unitOfMeasure))
            if !article.aliases.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Aliase (Kosenamen)").foregroundStyle(.secondary).font(.footnote)
                    Text(article.aliases.joined(separator: ", "))
                }
            }
            if let description = article.description, !description.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Beschreibung").foregroundStyle(.secondary).font(.footnote)
                    Text(description)
                }
            }
            if let notes = article.notes, !notes.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Notizen").foregroundStyle(.secondary).font(.footnote)
                    Text(notes)
                }
            }
            if let stock = viewModel.stock {
                LabeledContent("Objekte im Bestand", value: "\(stock.total) gesamt · \(stock.available) verfügbar · \(stock.borrowed) ausgeliehen")
            }
        }
    }

    private func nonEmpty(_ value: String?) -> String {
        guard let value, !value.isEmpty else { return "—" }
        return value
    }

    @ViewBuilder
    private func editForm() -> some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Name", text: $viewModel.editName)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("articles.detail.nameField")

            Picker("Kategorie", selection: $viewModel.editCategoryId) {
                Text("Keine Kategorie").tag(String?.none)
                ForEach(viewModel.categories) { category in
                    Text(category.name).tag(String?.some(category.id))
                }
            }

            TextField("Hersteller", text: $viewModel.editManufacturer)
                .textFieldStyle(.roundedBorder)
            TextField("Maßeinheit", text: $viewModel.editUnitOfMeasure)
                .textFieldStyle(.roundedBorder)

            VStack(alignment: .leading, spacing: 4) {
                Text("Beschreibung").font(.footnote).foregroundStyle(.secondary)
                TextEditor(text: $viewModel.editDescription).frame(minHeight: 60)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Notizen").font(.footnote).foregroundStyle(.secondary)
                TextEditor(text: $viewModel.editNotes).frame(minHeight: 60)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Aliase (Kosenamen)").font(.footnote).foregroundStyle(.secondary)
                AliasEditorView(aliases: $viewModel.editAliases)
            }

            Button("Abbrechen") { viewModel.cancelEditing() }
                .font(.footnote)
        }
    }

    // MARK: - Dokumente

    @ViewBuilder
    private var documentsTab: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Dokumente").font(.subheadline.weight(.semibold))
            if viewModel.documents.isEmpty {
                Text("Keine Dateien.").font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(viewModel.documents) { attachment in
                ArticleAttachmentRow(attachment: attachment) {
                    Task { await viewModel.deleteAttachment(attachment.id) }
                }
            }
            if canUpdate {
                Button {
                    showDocumentImporter = true
                } label: {
                    Label("Datei hochladen", systemImage: "square.and.arrow.up")
                }
                .font(.footnote)
                .accessibilityIdentifier("articles.detail.uploadDocumentButton")
            }
        }
        .padding()
        .fileImporter(
            isPresented: $showDocumentImporter,
            allowedContentTypes: [.pdf, .image, .plainText, .data],
            onCompletion: handlePickedDocument
        )
    }

    private func handlePickedDocument(_ result: Result<URL, Error>) {
        guard case .success(let url) = result else { return }
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }
        guard let data = try? Data(contentsOf: url) else { return }
        let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        Task { await viewModel.uploadDocument(fileName: url.lastPathComponent, mimeType: mimeType, data: data) }
    }

    // MARK: - Objekte dieses Artikels

    @ViewBuilder
    private var unitsTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Objekte dieses Artikels").font(.subheadline.weight(.semibold))
            if viewModel.units.isEmpty {
                Text("Keine Objekte zu diesem Artikel.").foregroundStyle(.secondary)
            } else {
                ForEach(viewModel.units) { unit in
                    NavigationLink {
                        InventoryDetailView(itemId: unit.id)
                    } label: {
                        InventoryRowView(item: unit)
                    }
                }
            }
        }
        .padding()
    }
}

private struct ArticleAttachmentRow: View {
    let attachment: Attachment
    let onDelete: () -> Void

    var body: some View {
        HStack {
            Image(systemName: "doc").foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.fileName).font(.subheadline)
                Text(ByteCountFormatter.string(fromByteCount: Int64(attachment.sizeBytes), countStyle: .file))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button(role: .destructive, action: onDelete) {
                Image(systemName: "trash")
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 2)
    }
}
