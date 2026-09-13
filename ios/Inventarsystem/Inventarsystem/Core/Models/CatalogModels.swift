import Foundation

nonisolated struct Category: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
    let parentId: String?
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
}

/// A reference to an Artikel carrying only what's needed inline (e.g. inside
/// `InventoryItem.parentItem`) — the backend genuinely sends this slimmer shape there, not a
/// full `Article`, so it is modeled as its own type rather than an "optional-everything" Article.
nonisolated struct ArticleSummary: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
}

nonisolated struct StockSummary: Codable, Sendable, Hashable {
    let total: Int
    let available: Int
    let borrowed: Int
}

/// The Artikel (catalog/product-type) entity — separate from `InventoryItem` (the physical
/// unit). Fields verified against a live instance; the free-form `attributes` JSON blob is
/// intentionally not modeled (not surfaced anywhere in the reference frontend UI either).
nonisolated struct Article: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
    let description: String?
    let notes: String?
    let aliases: [String]
    let categoryId: String?
    let unitOfMeasure: String?
    let manufacturer: String?
    let imageUrl: String?
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    /// Present only when this `Article` was embedded inside an `InventoryItem` **detail**
    /// response (verified against a live instance) — absent (decodes to `nil`) in every other
    /// context, including the flat/grouped inventory list and the `/articles` list itself.
    let documents: [Attachment]?

    static func == (lhs: Article, rhs: Article) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// `GET /articles` row shape: an `Article`'s own fields plus an expanded `category` and a
/// computed `stock` summary, flattened into one JSON object (verified against a live instance).
/// Decodes by feeding the same decoder into `Article`'s own synthesized init (ignoring the two
/// extra keys) and separately picking up `category`/`stock`, instead of duplicating every field.
nonisolated struct ArticleListItem: Decodable, Identifiable, Sendable {
    let article: Article
    let category: Category?
    let stock: StockSummary

    var id: String { article.id }

    private enum SideKeys: String, CodingKey { case category, stock }

    init(from decoder: Decoder) throws {
        article = try Article(from: decoder)
        let container = try decoder.container(keyedBy: SideKeys.self)
        category = try container.decodeIfPresent(Category.self, forKey: .category)
        stock = try container.decode(StockSummary.self, forKey: .stock)
    }
}
