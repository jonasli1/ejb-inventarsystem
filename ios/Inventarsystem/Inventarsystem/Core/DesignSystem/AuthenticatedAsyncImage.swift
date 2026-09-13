import SwiftUI

/// `AsyncImage`-alike for authenticated attachment URLs. The backend's thumbnail/medium/
/// download endpoints all require a bearer token, so plain `AsyncImage(url:)` can't be used
/// directly — this routes through the shared `ImageCache` instead. Per the task's lazy-loading
/// requirement: pass a thumbnail URL in lists/search, and only ever request the medium/original
/// URL from a detail or full-screen view, never both at once for the same row.
struct AuthenticatedAsyncImage<Content: View, Placeholder: View>: View {
    let url: URL?
    @ViewBuilder var content: (Image) -> Content
    @ViewBuilder var placeholder: () -> Placeholder

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                content(Image(uiImage: image))
            } else {
                placeholder()
            }
        }
        .task(id: url) {
            image = nil
            guard let url else { return }
            image = await ImageCache.shared.image(for: url)
        }
    }
}
