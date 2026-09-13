import SwiftUI

/// A single Inventarobjekt row — includes a small Artikel thumbnail, matching the reference
/// frontend's `InventoryItemRow`/`ArticleImageThumbnail` (one lazy per-article `/attachments`
/// fetch, cached — see `ArticleThumbnailView`). The flat/grouped list responses themselves carry
/// no image data, so this is a per-row lookup on both platforms, bounded by SwiftUI's `List`
/// only realizing on-screen rows.
struct InventoryRowView: View {
    let item: InventoryItem
    /// Current search bar text - shown as an "Alias: …" hint when it only matched one of the
    /// article's aliases, not the article's own name (mirrors the reference frontend's
    /// `InventoryItemRow`).
    var searchText: String = ""

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ArticleThumbnailView(articleId: item.article.id)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(item.displayNumber)
                        .font(.body.weight(.medium))
                    Spacer()
                    StatusBadge(status: item.status)
                }
                Text(item.article.name)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if !searchText.isEmpty,
                    let alias = item.article.aliases.first(where: { $0.localizedCaseInsensitiveContains(searchText) }) {
                    Text("Alias: \(alias)")
                        .font(.caption2)
                        .foregroundStyle(.purple)
                }
                Text("\(item.location.name) · \(item.room.name)")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
    }
}

struct GroupedInventoryRowView: View {
    let entry: GroupedInventoryEntry
    var searchText: String = ""

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ArticleThumbnailView(articleId: entry.article.id)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(entry.article.name)
                        .font(.body.weight(.medium))
                    if !searchText.isEmpty,
                        let alias = entry.article.aliases.first(where: { $0.localizedCaseInsensitiveContains(searchText) }) {
                        Text("Alias: \(alias)")
                            .font(.caption2)
                            .foregroundStyle(.purple)
                    }
                }
                Text("\(entry.stock.total) gesamt · \(entry.stock.available) verfügbar · \(entry.stock.borrowed) ausgeliehen")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
