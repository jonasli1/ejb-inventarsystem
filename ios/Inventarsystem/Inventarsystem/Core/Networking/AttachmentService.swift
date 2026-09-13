import Foundation

/// Generic attachment storage for all three entity types (Artikel, Inventarobjekt, Ausleihe-
/// Position) — one backend controller, one client-side service shared by every feature that
/// shows documents/images/condition photos.
nonisolated protocol AttachmentServicing: Sendable {
    func list(entityType: AttachmentEntityType, entityId: String, category: AttachmentCategory?) async throws -> [Attachment]
    func upload(entityType: AttachmentEntityType, entityId: String, category: AttachmentCategory, fileName: String, mimeType: String, data: Data) async throws -> Attachment
    func delete(id: String) async throws
}

nonisolated struct AttachmentService: AttachmentServicing {
    func list(entityType: AttachmentEntityType, entityId: String, category: AttachmentCategory? = nil) async throws -> [Attachment] {
        var query = [
            URLQueryItem(name: "entityType", value: entityType.rawValue),
            URLQueryItem(name: "entityId", value: entityId)
        ]
        if let category { query.append(URLQueryItem(name: "category", value: category.rawValue)) }
        return try await APIClient.shared.request("attachments", query: query)
    }

    func upload(
        entityType: AttachmentEntityType,
        entityId: String,
        category: AttachmentCategory,
        fileName: String,
        mimeType: String,
        data: Data
    ) async throws -> Attachment {
        try await APIClient.shared.uploadMultipart(
            "attachments/\(entityType.rawValue)/\(entityId)",
            fileFieldName: "file",
            fileName: fileName,
            mimeType: mimeType,
            fileData: data,
            formFields: ["category": category.rawValue]
        )
    }

    func delete(id: String) async throws {
        try await APIClient.shared.requestVoid("attachments/\(id)", method: "DELETE")
    }
}
