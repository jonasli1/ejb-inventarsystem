import SwiftUI

/// Per-article thumbnail cache: `articleId` → resolved thumbnail URL (or `.some(nil)` once
/// confirmed the article has no image), so scrolling a row back into view never re-queries
/// `GET /attachments` — mirrors the frontend's react-query cache for the same query key
/// (`ArticleImageThumbnail.tsx`), just implemented by hand here instead of pulled in as a library.
actor ArticleThumbnailLookup {
    static let shared = ArticleThumbnailLookup()

    private var cache: [String: URL?] = [:]
    private let service: AttachmentServicing

    init(service: AttachmentServicing = AttachmentService()) {
        self.service = service
    }

    func thumbnailURL(forArticleId articleId: String) async -> URL? {
        if let cached = cache[articleId] { return cached }
        let attachments = try? await service.list(entityType: .article, entityId: articleId, category: .image)
        let url = attachments?.first?.resolvedThumbnailURL
        cache[articleId] = url
        return url
    }
}

/// Small Artikel-image thumbnail for list rows (Inventar, Artikel) — mirrors the frontend's
/// `ArticleImageThumbnail`: one lazy `GET /attachments?entityType=article&category=image` per
/// article the first time it scrolls into view, a package icon placeholder otherwise/while
/// loading. Not embedded in the list response itself (the backend's flat/grouped inventory and
/// article list queries don't select image data), so this stays a per-row fetch on both
/// platforms — SwiftUI's `List` only realizes on-screen rows, so it's bounded the same way the
/// frontend's virtualized list bounds its own per-row queries.
struct ArticleThumbnailView: View {
    let articleId: String
    var size: CGFloat = 36

    @State private var thumbnailURL: URL?

    var body: some View {
        Group {
            if let thumbnailURL {
                AuthenticatedAsyncImage(url: thumbnailURL) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    placeholder
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .task(id: articleId) {
            thumbnailURL = await ArticleThumbnailLookup.shared.thumbnailURL(forArticleId: articleId)
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(Color(.secondarySystemBackground))
            .overlay {
                Image(systemName: "shippingbox")
                    .font(.system(size: size * 0.45))
                    .foregroundStyle(.secondary)
            }
    }
}

#Preview {
    VStack(spacing: 12) {
        ArticleThumbnailView(articleId: "preview-id")
        ArticleThumbnailView(articleId: "preview-id-2", size: 56)
    }
    .padding()
}
