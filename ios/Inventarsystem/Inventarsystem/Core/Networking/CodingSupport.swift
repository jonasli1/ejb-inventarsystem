import Foundation

/// Shared JSON coding for every API model. The backend serializes `DateTime` fields as full
/// ISO 8601 strings with fractional seconds (confirmed against a live instance, e.g.
/// `"2026-09-12T16:21:06.778Z"`); a plain formatter without fractional seconds is kept as a
/// fallback for any endpoint that omits them.
nonisolated enum APICoding {
    private static let isoWithFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = isoWithFractional.date(from: string) { return date }
            if let date = isoPlain.date(from: string) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Ungültiges Datumsformat: \(string)")
        }
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(isoWithFractional.string(from: date))
        }
        return encoder
    }()
}

/// Cursor/keyset pagination envelope — flat inventory list, audit log, activity feed.
/// The cursor itself is an opaque, server-defined string; never construct one client-side.
nonisolated struct CursorPage<Item: Decodable>: Decodable {
    let data: [Item]
    let nextCursor: String?
}

/// Classic offset pagination envelope — grouped inventory, articles, organizations, users, loans.
nonisolated struct OffsetPage<Item: Decodable>: Decodable {
    let data: [Item]
    let meta: PageMeta
}

nonisolated struct PageMeta: Decodable, Sendable {
    let page: Int
    let pageSize: Int
    let total: Int
    let totalPages: Int
}
