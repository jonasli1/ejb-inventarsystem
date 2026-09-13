import Foundation

/// Lets `ArticleListItem` be used directly with `AsyncSearchPicker` — the Artikel picker on the
/// Inventarobjekt create/edit form, matching the reference frontend's `ArticleSearchSelect`.
extension ArticleListItem: SearchPickerRow {
    var title: String { article.name }
    var subtitle: String? { category?.name }
    var searchableAliases: [String] { article.aliases }
}
