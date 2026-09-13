import Testing
import Foundation
@testable import Inventarsystem

/// Pure decode/message tests — no shared mutable state, safe to run in parallel with anything.
struct APIErrorTests {
    @Test func decodesSingleStringMessage() throws {
        // Captured verbatim from a live backend response to POST /auth/login with wrong credentials.
        let json = Data("""
        {"statusCode":401,"code":"INVALID_CREDENTIALS","error":"AppUnauthorizedException","message":"E-Mail-Adresse oder Passwort ist falsch.","path":"/api/v1/auth/login","timestamp":"2026-09-12T16:32:36.701Z"}
        """.utf8)

        let body = try APICoding.decoder.decode(BackendErrorBody.self, from: json)

        #expect(body.statusCode == 401)
        #expect(body.code == "INVALID_CREDENTIALS")
        #expect(body.message.displayText == "E-Mail-Adresse oder Passwort ist falsch.")
    }

    @Test func decodesArrayMessageAndJoinsForDisplay() throws {
        // Captured verbatim from a live backend validation-error response.
        let json = Data("""
        {"statusCode":400,"code":"VALIDATION_ERROR","error":"ValidationFailedException","message":["Name muss mindestens 1 Zeichen lang sein.","Name muss Text sein."],"path":"/api/v1/articles","timestamp":"2026-09-12T16:33:11.862Z"}
        """.utf8)

        let body = try APICoding.decoder.decode(BackendErrorBody.self, from: json)

        #expect(body.code == "VALIDATION_ERROR")
        #expect(body.message.displayText.contains("mindestens 1 Zeichen"))
        #expect(body.message.displayText.contains("Text sein"))
    }

    @Test func everyCaseHasANonEmptyGermanUserMessage() {
        let cases: [APIError] = [
            .server(statusCode: 500, code: "SOME_CODE", message: "Interner Fehler."),
            .network(underlying: URLError(.notConnectedToInternet)),
            .decoding(underlying: URLError(.cannotParseResponse)),
            .invalidBaseURL,
            .unauthorized
        ]
        for error in cases {
            #expect(!(error.errorDescription ?? "").isEmpty)
        }
    }

    @Test func codeAndStatusCodeAccessorsOnlyApplyToServerCase() {
        #expect(APIError.server(statusCode: 409, code: "X", message: "m").code == "X")
        #expect(APIError.server(statusCode: 409, code: "X", message: "m").statusCode == 409)
        #expect(APIError.unauthorized.code == nil)
        #expect(APIError.invalidBaseURL.statusCode == nil)
    }
}
