import SwiftUI

extension View {
    /// Part of the app's central error layer: shows a standard alert with `message` (already a
    /// German, user-facing string — typically `APIError.errorDescription`) whenever it becomes
    /// non-nil, and clears it back to `nil` on dismiss. Every action that can fail (save,
    /// delete, approve, ...) should route its caught error through a binding like this rather
    /// than swallowing it — the task requires errors are never silent.
    ///
    /// Form-validation-style errors (e.g. login) are often clearer shown inline instead; this
    /// modifier is for one-off action failures.
    func errorAlert(_ message: Binding<String?>) -> some View {
        alert(
            "Fehler",
            isPresented: Binding(
                get: { message.wrappedValue != nil },
                set: { isPresented in if !isPresented { message.wrappedValue = nil } }
            ),
            actions: { Button("OK", role: .cancel) {} },
            message: { Text(message.wrappedValue ?? "") }
        )
    }
}
