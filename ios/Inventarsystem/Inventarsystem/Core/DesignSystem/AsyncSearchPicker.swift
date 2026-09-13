import SwiftUI

/// A row in an `AsyncSearchPicker` list — either selectable, or disabled with a German reason
/// shown in place of the normal secondary text (e.g. accessory-candidate ineligibility from
/// `GET /inventory/:id/accessory-candidates`).
protocol SearchPickerRow: Identifiable {
    var title: String { get }
    var subtitle: String? { get }
    var isSelectable: Bool { get }
    /// Shown instead of `subtitle`, in red, when `isSelectable == false`.
    var ineligibilityReason: String? { get }
    /// The underlying article's alternate names, if any — shown as an "Alias: …" hint below the
    /// row when the current search query only matched one of these, not the row's own `title`.
    var searchableAliases: [String] { get }
}

extension SearchPickerRow {
    var isSelectable: Bool { true }
    var ineligibilityReason: String? { nil }
    var searchableAliases: [String] { [] }
}

/// Generic debounced, server-searched picker — the SwiftUI analog of the reference frontend's
/// `ArticleSearchSelect`/`AccessorySearchSelect`/`ItemSearchSelect` components. Used for any
/// large, server-backed collection (Artikel, Inventarobjekt, accessory candidates, users, ...).
/// Kept deliberately separate from plain `Picker`, which stays the right tool for small, fixed
/// vocabularies (status, org/unit, location/room) — don't route those through this component.
///
/// Also the single place the camera-scan entry point is wired in, satisfying "everywhere an
/// inventory object can be searched, add a camera action" by construction: every screen that
/// embeds this component for an Inventarobjekt search gets scanning for free.
struct AsyncSearchPicker<Row: SearchPickerRow>: View {
    let placeholder: String
    /// Called on every debounced keystroke (and once with `""` on first appearance); returns
    /// the rows to display.
    let search: (String) async -> [Row]
    let onSelect: (Row) -> Void
    /// Shows the sticker-scan camera action next to the field — only meaningful when this
    /// picker searches by inventory number (not e.g. a user or article-only picker).
    var enableStickerScan = false
    var emptyStateTitle = "Keine Treffer"

    @State private var query = ""
    @State private var rows: [Row] = []
    @State private var isSearching = false
    @State private var hasSearchedOnce = false
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField(placeholder, text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: query) { _, newValue in scheduleSearch(for: newValue) }
                    if !query.isEmpty {
                        Button {
                            query = ""
                            scheduleSearch(for: "")
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(8)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))

                if enableStickerScan {
                    StickerScanButton { recognizedNumber in
                        query = recognizedNumber
                        scheduleSearch(for: recognizedNumber)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)

            Group {
                if isSearching && rows.isEmpty {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                } else if hasSearchedOnce && rows.isEmpty {
                    ContentUnavailableView(emptyStateTitle, systemImage: "magnifyingglass")
                } else {
                    List(rows) { row in
                        Button {
                            if row.isSelectable { onSelect(row) }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.title)
                                    .foregroundStyle(row.isSelectable ? .primary : .secondary)
                                if !row.isSelectable, let reason = row.ineligibilityReason {
                                    Text(reason)
                                        .font(.caption)
                                        .foregroundStyle(.red)
                                } else if let subtitle = row.subtitle {
                                    Text(subtitle)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if !query.isEmpty, let alias = row.searchableAliases.first(where: {
                                    $0.localizedCaseInsensitiveContains(query)
                                }) {
                                    Text("Alias: \(alias)")
                                        .font(.caption2)
                                        .foregroundStyle(.purple)
                                }
                            }
                        }
                        .disabled(!row.isSelectable)
                        .opacity(row.isSelectable ? 1 : 0.5)
                    }
                    .listStyle(.plain)
                }
            }
        }
        .task { await runSearch(for: "") }
    }

    private func scheduleSearch(for text: String) {
        searchTask?.cancel()
        searchTask = Task {
            isSearching = true
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            await runSearch(for: text)
        }
    }

    private func runSearch(for text: String) async {
        isSearching = true
        rows = await search(text)
        isSearching = false
        hasSearchedOnce = true
    }
}
