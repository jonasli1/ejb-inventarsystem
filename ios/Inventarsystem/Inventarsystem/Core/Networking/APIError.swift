import Foundation

/// Mirrors the backend's global exception filter response shape exactly:
/// `{statusCode, code, error, message, path, timestamp}` (see
/// `backend/src/common/filters/all-exceptions.filter.ts`). `message` is a single German string
/// for most errors, but a `string[]` for class-validator validation failures.
nonisolated struct BackendErrorBody: Decodable {
    let statusCode: Int
    let code: String?
    let error: String?
    let message: MessageValue
    let path: String?
    let timestamp: String?

    nonisolated enum MessageValue: Decodable {
        case single(String)
        case multiple([String])

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let text = try? container.decode(String.self) {
                self = .single(text)
            } else {
                self = .multiple(try container.decode([String].self))
            }
        }

        /// The text to actually show the user — German, verbatim from the backend.
        var displayText: String {
            switch self {
            case .single(let text): return text
            case .multiple(let texts): return texts.joined(separator: "\n")
            }
        }
    }
}

/// The single error type every networking call throws. `code` is deliberately kept as a raw,
/// non-exhaustive `String?` (mirroring the frontend's own `ApiErrorBody.code?: string`) so the
/// backend can introduce new codes without requiring an app update — callers switch on known
/// string constants, never on an exhaustive enum.
nonisolated enum APIError: Error {
    /// The backend responded with a structured, non-2xx error. `message` is already the
    /// German text meant for display.
    case server(statusCode: Int, code: String?, message: String)
    /// Transport-level failure (no connection, timeout, TLS, DNS, ...).
    case network(underlying: Error)
    /// The response body didn't match the shape we expected.
    case decoding(underlying: Error)
    /// No valid Base URL is configured, or it failed format validation.
    case invalidBaseURL
    /// A request required auth but no access token was available, or a refresh-then-retry
    /// also failed — the caller should treat this as "session ended, show the login screen".
    case unauthorized

    /// Well-known backend `code` values worth switching on. Not exhaustive — always fall back
    /// to displaying `message` for anything not listed here.
    enum Code {
        static let duplicateInventoryNumber = "DUPLICATE_INVENTORY_NUMBER"
        static let missingPermission = "MISSING_PERMISSION"
        static let validationError = "VALIDATION_ERROR"
        static let invalidStatusTransition = "INVALID_STATUS_TRANSITION"
        static let tooManyRequests = "TOO_MANY_REQUESTS"
        static let itemCurrentlyBorrowed = "ITEM_CURRENTLY_BORROWED"
        static let accessorySelfReference = "ACCESSORY_SELF_REFERENCE"
        static let unitOrganizationMismatch = "UNIT_ORGANIZATION_MISMATCH"
    }

    var code: String? {
        if case .server(_, let code, _) = self { return code }
        return nil
    }

    var statusCode: Int? {
        if case .server(let statusCode, _, _) = self { return statusCode }
        return nil
    }
}

extension APIError: LocalizedError {
    /// The message to show the user — always German, never a silent failure.
    var errorDescription: String? {
        switch self {
        case .server(_, _, let message):
            return message
        case .network:
            return "Verbindung zum Server fehlgeschlagen. Bitte Internetverbindung und Server-Adresse prüfen."
        case .decoding:
            return "Die Antwort des Servers konnte nicht verarbeitet werden."
        case .invalidBaseURL:
            return "Die Server-Adresse ist nicht gültig konfiguriert."
        case .unauthorized:
            return "Die Sitzung ist abgelaufen. Bitte erneut anmelden."
        }
    }
}
