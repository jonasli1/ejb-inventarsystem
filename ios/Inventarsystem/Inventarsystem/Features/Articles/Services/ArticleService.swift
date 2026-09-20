import Foundation

nonisolated protocol ArticleServicing: Sendable {
    func search(query: String, categoryId: String?, page: Int, pageSize: Int) async throws -> (items: [ArticleListItem], meta: PageMeta)
    func fetchDetail(id: String) async throws -> ArticleListItem
    func fetchUnits(id: String) async throws -> [InventoryItem]
    func create(_ input: ArticleInput) async throws -> Article
    func update(id: String, input: ArticleInput) async throws -> Article
    func delete(id: String) async throws
}

nonisolated struct ArticleInput: Encodable, Sendable {
    var name: String
    var description: String = ""
    var notes: String = ""
    var aliases: [String] = []
    var categoryId: String?
    var unitOfMeasure: String = ""
    var manufacturer: String = ""
    var loanableByQuantity: Bool = false

    private enum CodingKeys: String, CodingKey {
        case name, description, notes, aliases, categoryId, unitOfMeasure, manufacturer, loanableByQuantity
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(description, forKey: .description)
        try container.encode(notes, forKey: .notes)
        try container.encode(aliases, forKey: .aliases)
        try container.encodeIfPresent(categoryId, forKey: .categoryId)
        try container.encode(unitOfMeasure, forKey: .unitOfMeasure)
        try container.encode(manufacturer, forKey: .manufacturer)
        try container.encode(loanableByQuantity, forKey: .loanableByQuantity)
    }
}

nonisolated struct ArticleService: ArticleServicing {
    func search(query: String, categoryId: String?, page: Int = 1, pageSize: Int = 20) async throws -> (items: [ArticleListItem], meta: PageMeta) {
        var items = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "pageSize", value: String(pageSize))]
        if !query.isEmpty { items.append(URLQueryItem(name: "search", value: query)) }
        if let categoryId { items.append(URLQueryItem(name: "categoryId", value: categoryId)) }
        let result: OffsetPage<ArticleListItem> = try await APIClient.shared.request("articles", query: items)
        return (result.data, result.meta)
    }

    func fetchDetail(id: String) async throws -> ArticleListItem {
        try await APIClient.shared.request("articles/\(id)")
    }

    func fetchUnits(id: String) async throws -> [InventoryItem] {
        try await APIClient.shared.request("articles/\(id)/units")
    }

    func create(_ input: ArticleInput) async throws -> Article {
        try await APIClient.shared.request("articles", method: "POST", body: input)
    }

    func update(id: String, input: ArticleInput) async throws -> Article {
        try await APIClient.shared.request("articles/\(id)", method: "PUT", body: input)
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("articles/\(id)", method: "DELETE")
    }
}
