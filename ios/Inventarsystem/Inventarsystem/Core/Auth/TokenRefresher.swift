import Foundation

/// Coalesces concurrent 401-triggered refresh attempts into a single in-flight call — the
/// Swift analog of the reference frontend's single shared `refreshPromise`. Without this, N
/// requests failing at once with an expired token would fire N parallel `/auth/refresh` calls;
/// since the backend rotates the refresh token on every use, only the first would succeed and
/// the rest would invalidate each other.
actor TokenRefresher {
    private var inFlightTask: Task<Bool, Never>?
    private let performRefresh: @Sendable (String) async -> TokenResponse?

    init(performRefresh: @escaping @Sendable (String) async -> TokenResponse?) {
        self.performRefresh = performRefresh
    }

    /// Returns whether the session now holds a valid, freshly rotated token pair.
    @discardableResult
    func refresh() async -> Bool {
        if let inFlightTask {
            return await inFlightTask.value
        }
        let task = Task<Bool, Never> { [performRefresh] in
            guard let currentRefreshToken = KeychainTokenStore.load()?.refreshToken else { return false }
            guard let newTokens = await performRefresh(currentRefreshToken) else { return false }
            // The backend rotates the refresh token on every use — persist the NEW pair, never
            // the one that was just spent, or every refresh after the first would silently fail.
            KeychainTokenStore.save(newTokens)
            return true
        }
        inFlightTask = task
        let result = await task.value
        inFlightTask = nil
        return result
    }
}
