import Foundation
import Security

/// Persists auth tokens in the Keychain — never `UserDefaults`, per the app's security
/// requirements. The Security framework has no async API and Keychain calls are fast local
/// syscalls, so this is deliberately a plain `enum` of `nonisolated` static functions rather
/// than an actor — safe to call from anywhere without an `await`.
nonisolated enum KeychainTokenStore {
    private static let service = "app.lindner.Inventarsystem.tokens"

    private enum Key: String {
        case accessToken
        case refreshToken
        case accessTokenExpiresAt
    }

    struct StoredTokens: Sendable {
        let accessToken: String
        let refreshToken: String
        let accessTokenExpiresAt: Date
    }

    static func save(_ tokens: TokenResponse) {
        set(tokens.accessToken, for: .accessToken)
        set(tokens.refreshToken, for: .refreshToken)
        let expiresAt = Date().addingTimeInterval(TimeInterval(tokens.expiresIn))
        set(String(expiresAt.timeIntervalSince1970), for: .accessTokenExpiresAt)
    }

    static func load() -> StoredTokens? {
        guard let accessToken = get(.accessToken),
              let refreshToken = get(.refreshToken),
              let expiresAtRaw = get(.accessTokenExpiresAt),
              let interval = TimeInterval(expiresAtRaw)
        else { return nil }
        return StoredTokens(
            accessToken: accessToken,
            refreshToken: refreshToken,
            accessTokenExpiresAt: Date(timeIntervalSince1970: interval)
        )
    }

    static func clear() {
        delete(.accessToken)
        delete(.refreshToken)
        delete(.accessTokenExpiresAt)
    }

    // MARK: - Low-level Keychain access

    private static func set(_ value: String, for key: Key) {
        let data = Data(value.utf8)
        SecItemDelete(baseQuery(for: key) as CFDictionary)
        var query = baseQuery(for: key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary, nil)
    }

    private static func get(_ key: Key) -> String? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func delete(_ key: Key) {
        SecItemDelete(baseQuery(for: key) as CFDictionary)
    }

    /// No `kSecAttrSynchronizable`: tokens deliberately never sync via iCloud Keychain.
    private static func baseQuery(for key: Key) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue
        ]
    }
}
