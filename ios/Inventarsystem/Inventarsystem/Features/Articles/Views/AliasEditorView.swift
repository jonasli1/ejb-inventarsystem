import SwiftUI

/// A simple add/remove editor for an Artikel's Aliase (Kosenamen) — the field is just `[String]`
/// server-side, so this is plain text rows rather than anything picker-like. Shared by
/// `ArticleCreateView` and `ArticleDetailView`'s edit form.
struct AliasEditorView: View {
    @Binding var aliases: [String]

    var body: some View {
        ForEach(aliases.indices, id: \.self) { index in
            HStack {
                TextField("Alias", text: Binding(
                    get: { aliases[index] },
                    set: { aliases[index] = $0 }
                ))
                .autocorrectionDisabled()
                Button(role: .destructive) {
                    aliases.remove(at: index)
                } label: {
                    Image(systemName: "minus.circle")
                }
                .buttonStyle(.plain)
            }
        }
        Button {
            aliases.append("")
        } label: {
            Label("Alias hinzufügen", systemImage: "plus")
        }
        .font(.footnote)
        .accessibilityIdentifier("articles.addAliasButton")
    }
}

#Preview {
    AliasEditorPreviewContainer()
}

private struct AliasEditorPreviewContainer: View {
    @State private var aliases = ["Beamer", "Projektor"]

    var body: some View {
        Form {
            Section("Aliase (Kosenamen)") {
                AliasEditorView(aliases: $aliases)
            }
        }
    }
}
