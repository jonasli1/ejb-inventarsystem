import SwiftUI

/// A single Inventarobjekt row — deliberately text-only/fast (no per-row image fetch): with
/// lists needing to stay fluid at >1M objects, a thumbnail here would mean an extra network
/// round trip per visible row. Article images are shown where a one-time per-screen cost is
/// trivial instead (the Artikel and Inventarobjekt detail views).
struct InventoryRowView: View {
    let item: InventoryItem
    /// Current search bar text - shown as an "Alias: …" hint when it only matched one of the
    /// article's aliases, not the article's own name (mirrors the reference frontend's
    /// `InventoryItemRow`).
    var searchText: String = ""

    var body: some View {
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
        .padding(.vertical, 2)
    }
}

struct GroupedInventoryRowView: View {
    let entry: GroupedInventoryEntry
    var searchText: String = ""

    var body: some View {
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
        .padding(.vertical, 2)
    }
}
