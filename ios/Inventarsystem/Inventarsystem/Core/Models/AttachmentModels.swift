import Foundation

nonisolated enum AttachmentEntityType: String, Codable, Sendable {
    case article
    case inventoryItem
    case loanItem
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AttachmentEntityType(rawValue: raw) ?? .unknown
    }
}

/// `image` is a single product photo (Artikel-only, replaces any existing one on new upload),
/// `document`/`inspection` are files on an Artikel or Inventarobjekt (`inspection` = DGUV/
/// maintenance documents), `checkoutPhoto`/`returnPhoto` are Ausleihe condition photos.
nonisolated enum AttachmentCategory: String, Codable, Sendable {
    case image
    case document
    case inspection
    case checkoutPhoto
    case returnPhoto
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AttachmentCategory(rawValue: raw) ?? .unknown
    }

    var label: String {
        switch self {
        case .image: return "Bild"
        case .document: return "Dokument"
        case .inspection: return "Prüfdokument"
        case .checkoutPhoto: return "Zustandsfoto (Ausgabe)"
        case .returnPhoto: return "Zustandsfoto (Rückgabe)"
        case .unknown: return "Datei"
        }
    }
}

/// `GET /attachments` row — never the raw file itself, only URLs to lazily fetch thumbnail/
/// medium/original on demand (per the task's lazy-loading requirement). `thumbnailUrl`/
/// `mediumUrl` are `nil` for non-image categories.
nonisolated struct Attachment: Codable, Identifiable, Sendable {
    let id: String
    let entityType: AttachmentEntityType
    let entityId: String
    let category: AttachmentCategory
    let fileName: String
    let mimeType: String
    let sizeBytes: Int
    let uploadedById: String?
    let createdAt: Date
    let uploadedBy: UserSummary?
    let thumbnailUrl: String?
    let mediumUrl: String?
    /// `"own"` for an attachment on this entity itself, `"article"` when inherited read-only
    /// from the parent Artikel (shown on an Inventarobjekt's detail view).
    let origin: String

    var isOwn: Bool { origin == "own" }

    /// Resolves a server-returned path (which already includes `/api/v1`) against the bare
    /// origin — see `APIConfiguration.originURL`.
    private func resolve(_ path: String?) -> URL? {
        guard let path else { return nil }
        return URL(string: path, relativeTo: APIConfiguration.originURL)
    }

    var resolvedThumbnailURL: URL? { resolve(thumbnailUrl) }
    var resolvedMediumURL: URL? { resolve(mediumUrl) }
    var resolvedDownloadURL: URL? { resolve("/api/v1/attachments/\(id)/download") }
}
