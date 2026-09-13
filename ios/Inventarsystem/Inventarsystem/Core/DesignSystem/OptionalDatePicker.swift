import SwiftUI

/// A `DatePicker` that can represent "no date set" — SwiftUI's native `DatePicker` has no such
/// state. Shows a "Datum auswählen" placeholder when empty (matching the reference frontend's
/// own optional-date-field behavior for purchase date / next DGUV-V3 check / etc.) and a clear
/// button once a date is set.
struct OptionalDatePicker: View {
    let title: String
    @Binding var date: Date?

    var body: some View {
        if let bound = Binding($date) {
            HStack {
                DatePicker(title, selection: bound, displayedComponents: .date)
                Button {
                    date = nil
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        } else {
            Button {
                date = Date()
            } label: {
                HStack {
                    Text(title).foregroundStyle(.primary)
                    Spacer()
                    Text("Datum auswählen").foregroundStyle(.secondary)
                }
            }
        }
    }
}
