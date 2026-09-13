import Testing
import Foundation
@testable import Inventarsystem

/// Keychain access and `StubURLProtocol.handler` are both shared, global, mutable state, so
/// every test in this suite that touches either one is kept in a single `.serialized` suite —
/// otherwise Swift Testing's default parallel execution could interleave two tests' Keychain
/// writes or stub handlers and produce flaky failures unrelated to the code under test.
@Suite(.serialized)
struct CoreAuthNetworkingTests {

    // MARK: - KeychainTokenStore

    @Test func keychainRoundTripsAndClears() {
        KeychainTokenStore.clear()
        #expect(KeychainTokenStore.load() == nil)

        let tokens = TokenResponse(accessToken: "access-1", refreshToken: "refresh-1", tokenType: "Bearer", expiresIn: 900)
        KeychainTokenStore.save(tokens)

        let loaded = KeychainTokenStore.load()
        #expect(loaded?.accessToken == "access-1")
        #expect(loaded?.refreshToken == "refresh-1")
        #expect((loaded?.accessTokenExpiresAt.timeIntervalSinceNow ?? 0) > 800)

        KeychainTokenStore.clear()
        #expect(KeychainTokenStore.load() == nil)
    }

    @Test func keychainSavingNewTokensOverwritesOld() {
        KeychainTokenStore.clear()
        KeychainTokenStore.save(TokenResponse(accessToken: "a1", refreshToken: "r1", tokenType: "Bearer", expiresIn: 900))
        KeychainTokenStore.save(TokenResponse(accessToken: "a2", refreshToken: "r2", tokenType: "Bearer", expiresIn: 900))

        #expect(KeychainTokenStore.load()?.accessToken == "a2")
        #expect(KeychainTokenStore.load()?.refreshToken == "r2")

        KeychainTokenStore.clear()
    }

    // MARK: - TokenRefresher

    @Test func refresherCoalescesConcurrentCallsIntoOne() async {
        KeychainTokenStore.clear()
        KeychainTokenStore.save(TokenResponse(accessToken: "old-access", refreshToken: "old-refresh", tokenType: "Bearer", expiresIn: 900))

        let callCount = Counter()
        let refresher = TokenRefresher { refreshToken in
            await callCount.increment()
            #expect(refreshToken == "old-refresh")
            try? await Task.sleep(nanoseconds: 50_000_000)
            return TokenResponse(accessToken: "new-access", refreshToken: "new-refresh", tokenType: "Bearer", expiresIn: 900)
        }

        async let first = refresher.refresh()
        async let second = refresher.refresh()
        async let third = refresher.refresh()
        let results = [await first, await second, await third]

        #expect(results.allSatisfy { $0 })
        #expect(await callCount.value == 1)
        #expect(KeychainTokenStore.load()?.accessToken == "new-access")
        #expect(KeychainTokenStore.load()?.refreshToken == "new-refresh")

        KeychainTokenStore.clear()
    }

    /// Regression test for the rotation bug class: a refresher that (incorrectly) persisted the
    /// OLD refresh token would appear to work once and then fail on every subsequent refresh.
    @Test func refresherPersistsTheNewlyRotatedTokenAcrossTwoSequentialRefreshes() async {
        KeychainTokenStore.clear()
        KeychainTokenStore.save(TokenResponse(accessToken: "a0", refreshToken: "r0", tokenType: "Bearer", expiresIn: 900))

        let refresher = TokenRefresher { refreshToken in
            switch refreshToken {
            case "r0": return TokenResponse(accessToken: "a1", refreshToken: "r1", tokenType: "Bearer", expiresIn: 900)
            case "r1": return TokenResponse(accessToken: "a2", refreshToken: "r2", tokenType: "Bearer", expiresIn: 900)
            default: return nil // simulates the backend rejecting an already-spent refresh token
            }
        }

        #expect(await refresher.refresh())
        #expect(KeychainTokenStore.load()?.refreshToken == "r1")

        #expect(await refresher.refresh())
        #expect(KeychainTokenStore.load()?.accessToken == "a2")
        #expect(KeychainTokenStore.load()?.refreshToken == "r2")

        KeychainTokenStore.clear()
    }

    @Test func refresherReturnsFalseWhenNoRefreshTokenIsStored() async {
        KeychainTokenStore.clear()
        let refresher = TokenRefresher { _ in
            Issue.record("performRefresh should not be called with no stored refresh token")
            return nil
        }
        #expect(await refresher.refresh() == false)
    }

    // MARK: - APIClient (against a stubbed URLProtocol, no real network)

    @Test func getRequestSendsBearerTokenAndDecodesResponse() async throws {
        try await withTemporaryBaseURL {
            StubURLProtocol.handler = { request in
                #expect(request.url?.absoluteString == "https://example.test/api/v1/auth/me")
                #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-123")
                let json = Data("""
                {"id":"1","email":"a@b.de","displayName":"A B","isActive":true,"themePreference":"system","createdAt":"2026-01-01T00:00:00.000Z","authMethods":["local"],"roles":[],"permissions":["inventory.read"],"groups":[]}
                """.utf8)
                return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
            }

            let client = APIClient(session: makeStubbedSession())
            await client.configure(accessTokenProvider: { "token-123" }, refreshTokens: { false })

            let me: MeResponse = try await client.request("auth/me")
            #expect(me.displayName == "A B")
            #expect(me.permissions.contains("inventory.read"))
        }
    }

    @Test func pingCallsHealthURLUnderApiV1Prefix() async throws {
        try await withTemporaryBaseURL {
            // Verified empirically against a live instance: /health 404s, /api/v1/health is the
            // real endpoint — this test guards against ever regressing that.
            StubURLProtocol.handler = { request in
                #expect(request.url?.absoluteString == "https://example.test/api/v1/health")
                let json = Data("{\"status\":\"ok\",\"timestamp\":\"2026-01-01T00:00:00.000Z\"}".utf8)
                return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
            }
            let client = APIClient(session: makeStubbedSession())
            try await client.ping()
        }
    }

    @Test func a401TriggersExactlyOneRefreshThenRetriesWithTheNewToken() async throws {
        try await withTemporaryBaseURL {
            let currentToken = TokenBox(value: "expired-token")
            let requestCount = Counter()

            StubURLProtocol.handler = { request in
                await requestCount.increment()
                let used = request.value(forHTTPHeaderField: "Authorization")
                if used == "Bearer expired-token" {
                    let body = Data("""
                    {"statusCode":401,"code":"UNAUTHENTICATED","error":"AppUnauthorizedException","message":"Anmeldung erforderlich oder Sitzung abgelaufen.","path":"/api/v1/auth/me","timestamp":"2026-01-01T00:00:00.000Z"}
                    """.utf8)
                    return (HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, body)
                }
                #expect(used == "Bearer fresh-token")
                let json = Data("""
                {"id":"1","email":"a@b.de","displayName":"A","isActive":true,"themePreference":"system","createdAt":"2026-01-01T00:00:00.000Z","authMethods":["local"],"roles":[],"permissions":[],"groups":[]}
                """.utf8)
                return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, json)
            }

            let client = APIClient(session: makeStubbedSession())
            let refreshCount = Counter()
            await client.configure(
                accessTokenProvider: { await currentToken.value },
                refreshTokens: {
                    await refreshCount.increment()
                    await currentToken.set("fresh-token")
                    return true
                }
            )

            let me: MeResponse = try await client.request("auth/me")
            #expect(me.email == "a@b.de")
            #expect(await requestCount.value == 2)
            #expect(await refreshCount.value == 1)
        }
    }

    @Test func failedRefreshSurfacesAsUnauthorizedWithoutLooping() async throws {
        try await withTemporaryBaseURL {
            let requestCount = Counter()
            StubURLProtocol.handler = { request in
                await requestCount.increment()
                let body = Data("""
                {"statusCode":401,"code":"UNAUTHENTICATED","error":"AppUnauthorizedException","message":"Anmeldung erforderlich oder Sitzung abgelaufen.","path":"/api/v1/auth/me","timestamp":"2026-01-01T00:00:00.000Z"}
                """.utf8)
                return (HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, body)
            }

            let client = APIClient(session: makeStubbedSession())
            await client.configure(accessTokenProvider: { "expired-token" }, refreshTokens: { false })

            do {
                let _: MeResponse = try await client.request("auth/me")
                Issue.record("Expected APIError.unauthorized to be thrown")
            } catch let error as APIError {
                guard case .unauthorized = error else {
                    Issue.record("Expected .unauthorized, got \(error)")
                    return
                }
            }
            // Exactly one attempt: a failed refresh must not retry the original request at all.
            #expect(await requestCount.value == 1)
        }
    }

    @Test func serverErrorSurfacesMachineCodeAndGermanMessage() async throws {
        try await withTemporaryBaseURL {
            StubURLProtocol.handler = { request in
                let body = Data("""
                {"statusCode":409,"code":"DUPLICATE_INVENTORY_NUMBER","error":"AppConflictException","message":"Die Inventarnummer \\"A-123\\" wird bereits verwendet.","path":"/api/v1/inventory","timestamp":"2026-01-01T00:00:00.000Z"}
                """.utf8)
                return (HTTPURLResponse(url: request.url!, statusCode: 409, httpVersion: nil, headerFields: nil)!, body)
            }

            let client = APIClient(session: makeStubbedSession())
            await client.configure(accessTokenProvider: { "t" }, refreshTokens: { false })

            do {
                let _: MeResponse = try await client.request("inventory/whatever")
                Issue.record("Expected APIError.server to be thrown")
            } catch let error as APIError {
                #expect(error.code == APIError.Code.duplicateInventoryNumber)
                #expect(error.errorDescription?.contains("A-123") == true)
            }
        }
    }

    // MARK: - Helpers

    private func withTemporaryBaseURL(_ body: () async throws -> Void) async rethrows {
        let previous = APIConfiguration.baseURL
        APIConfiguration.baseURL = URL(string: "https://example.test")!
        defer { APIConfiguration.baseURL = previous }
        try await body()
    }
}

private actor Counter {
    private(set) var value = 0
    func increment() { value += 1 }
}

private actor TokenBox {
    private(set) var value: String
    init(value: String) { self.value = value }
    func set(_ newValue: String) { value = newValue }
}
