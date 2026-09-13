import Foundation

/// Lets `AccessoryCandidate` be used directly with `AsyncSearchPicker` — ineligible candidates
/// render grayed out with the server's German reason instead of being filtered out, matching
/// the reference frontend's `AccessorySearchSelect` exactly.
extension AccessoryCandidate: SearchPickerRow {
    var title: String { item.displayNumber }
    var subtitle: String? { "\(item.ownerOrganization.name) · \(item.location.name)" }
    var isSelectable: Bool { eligible }
    var ineligibilityReason: String? { reason }
    var searchableAliases: [String] { item.article.aliases }
}
