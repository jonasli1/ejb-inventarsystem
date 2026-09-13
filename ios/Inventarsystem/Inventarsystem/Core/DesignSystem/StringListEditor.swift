import SwiftUI

/// Generic add/remove/reorder editor for a `[String]` field — used by the sticker-profile
/// calibration UI (Ankerbegriffe/Extraktionsmuster/Ausschlussmuster) where a picker or dropdown
/// would not fit a free-form, ordered list of keywords or regex patterns.
struct StringListEditor: View {
    @Binding var items: [String]
    var placeholder: String = "Wert"
    var addLabel: String = "Hinzufügen"
    var monospaced: Bool = false
    /// Shows up/down controls — only meaningful for lists where order changes behavior
    /// (Extraktionsmuster: first pattern that matches wins).
    var reorderable: Bool = false
    var invalid: (String) -> Bool = { _ in false }

    var body: some View {
        ForEach(items.indices, id: \.self) { index in
            HStack(spacing: 8) {
                if reorderable {
                    VStack(spacing: 2) {
                        Button { move(index, by: -1) } label: { Image(systemName: "chevron.up") }
                            .disabled(index == 0)
                        Button { move(index, by: 1) } label: { Image(systemName: "chevron.down") }
                            .disabled(index == items.count - 1)
                    }
                    .buttonStyle(.plain)
                    .font(.caption2)
                }
                TextField(placeholder, text: Binding(
                    get: { items[index] },
                    set: { items[index] = $0 }
                ))
                .autocorrectionDisabled()
                .font(monospaced ? .system(.body, design: .monospaced) : .body)
                if invalid(items[index]) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                        .accessibilityLabel("Ungültiger regulärer Ausdruck")
                }
                Button(role: .destructive) {
                    items.remove(at: index)
                } label: {
                    Image(systemName: "minus.circle")
                }
                .buttonStyle(.plain)
            }
        }
        Button {
            items.append("")
        } label: {
            Label(addLabel, systemImage: "plus")
        }
        .font(.footnote)
    }

    private func move(_ index: Int, by offset: Int) {
        let target = index + offset
        guard items.indices.contains(target) else { return }
        items.swapAt(index, target)
    }
}

#Preview {
    Form {
        Section("Ankerbegriffe") {
            StringListEditor(items: .constant(["ejbe.de", "Jugendwerk", "Bernhausen"]))
        }
        Section("Extraktionsmuster") {
            StringListEditor(
                items: .constant([#"EJB\s*([0-9]{2,6})"#, #"Nr[:.]?\s*([0-9]{2,6})"#]),
                monospaced: true,
                reorderable: true
            )
        }
    }
}
