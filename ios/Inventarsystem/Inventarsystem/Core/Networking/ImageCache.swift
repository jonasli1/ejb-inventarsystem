import UIKit

/// In-memory cache for authenticated attachment images (thumbnail/medium/original), keyed by
/// URL. Every list/detail/picker that shows an attachment image shares this one instance
/// instead of each view inventing its own — the reference frontend's `ArticleImageThumbnail`
/// had to solve the exact same "don't refetch on every scroll/recompute" problem with React
/// Query's cache; this is the native equivalent. An `actor` (see `APIClient` for why: this
/// project's default-MainActor-isolation build setting would otherwise silently serialize
/// image fetches onto the main thread).
actor ImageCache {
    static let shared = ImageCache()

    private let cache = NSCache<NSURL, UIImage>()
    private var accessTokenProvider: (@Sendable () async -> String?)?

    private init() {
        cache.countLimit = 300
    }

    func configure(accessTokenProvider: @escaping @Sendable () async -> String?) {
        self.accessTokenProvider = accessTokenProvider
    }

    /// Returns the cached image if present, otherwise fetches it (with the current bearer
    /// token attached) and caches the result. Returns `nil` on any failure — callers show their
    /// own placeholder/failure state rather than this type surfacing an `APIError`, since a
    /// missing thumbnail shouldn't block or fail the screen it's on.
    func image(for url: URL) async -> UIImage? {
        if let cached = cache.object(forKey: url as NSURL) {
            return cached
        }
        var request = URLRequest(url: url)
        if let token = await accessTokenProvider?() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let image = UIImage(data: data)
        else { return nil }
        cache.setObject(image, forKey: url as NSURL)
        return image
    }

    /// Called when the Base URL changes (Settings) — cached images from a previous backend
    /// instance must not leak into the new one.
    func clear() {
        cache.removeAllObjects()
    }
}
