import SwiftUI
import UniformTypeIdentifiers

/// The Dokumente tab: two independent upload lists scoped to this Inventarobjekt itself
/// ("Dokumente" / "Prüfdokumente", matching the reference frontend's `InventoryDetailModal`
/// exactly), plus a read-only list inherited from the Artikel.
struct InventoryDocumentsTabView: View {
    let viewModel: InventoryDetailViewModel
    let canUpdate: Bool

    @State private var uploadTarget: AttachmentCategory?

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            documentSection(
                title: "Dokumente (z. B. Anleitungen)",
                category: .document,
                attachments: viewModel.documents
            )
            documentSection(
                title: "Prüfdokumente (z. B. E-Check)",
                category: .inspection,
                attachments: viewModel.inspectionDocuments
            )

            if let articleDocuments = viewModel.item?.article.documents, !articleDocuments.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Dokumente vom Artikel", systemImage: "doc.text")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.blue)
                    ForEach(articleDocuments) { attachment in
                        AttachmentRow(attachment: attachment, onDelete: nil)
                    }
                }
            }
        }
        .fileImporter(
            isPresented: Binding(get: { uploadTarget != nil }, set: { if !$0 { uploadTarget = nil } }),
            allowedContentTypes: [.pdf, .image, .plainText, .data],
            onCompletion: handlePickedFile
        )
    }

    @ViewBuilder
    private func documentSection(title: String, category: AttachmentCategory, attachments: [Attachment]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline.weight(.semibold))
            if attachments.isEmpty {
                Text("Keine Dateien.").font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(attachments) { attachment in
                AttachmentRow(attachment: attachment) {
                    Task { await viewModel.deleteAttachment(attachment.id) }
                }
            }
            if canUpdate {
                Button {
                    uploadTarget = category
                } label: {
                    Label("Datei hochladen", systemImage: "square.and.arrow.up")
                }
                .font(.footnote)
            }
        }
    }

    private func handlePickedFile(_ result: Result<URL, Error>) {
        guard let category = uploadTarget else { return }
        uploadTarget = nil
        guard case .success(let url) = result else { return }
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }
        guard let data = try? Data(contentsOf: url) else { return }
        let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        Task { await viewModel.uploadDocument(category: category, fileName: url.lastPathComponent, mimeType: mimeType, data: data) }
    }
}

private struct AttachmentRow: View {
    let attachment: Attachment
    var onDelete: (() -> Void)?

    var body: some View {
        HStack {
            Image(systemName: attachment.category == .image ? "photo" : "doc")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.fileName).font(.subheadline)
                Text(ByteCountFormatter.string(fromByteCount: Int64(attachment.sizeBytes), countStyle: .file))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if let onDelete {
                Button(role: .destructive, action: onDelete) {
                    Image(systemName: "trash")
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 2)
    }
}
