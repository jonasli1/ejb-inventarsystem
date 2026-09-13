import Foundation

/// Lets `InventoryItem` be used directly with `AsyncSearchPicker` — the universal
/// Inventarobjekt picker used when creating/editing an Ausleihe (matching the reference
/// frontend's `ItemSearchSelect`).
extension InventoryItem: SearchPickerRow {
    var title: String { displayNumber }
    var subtitle: String? { "\(article.name) · \(location.name)" }
    var searchableAliases: [String] { article.aliases }
}
