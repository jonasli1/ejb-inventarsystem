import Foundation

/// Lets `User` be used directly with `AsyncSearchPicker` — used by the Aktivitäten filter and
/// anywhere else a person needs to be picked from a potentially large list.
extension User: SearchPickerRow {
    var title: String { displayName }
    var subtitle: String? { email }
}
