import SwiftUI

/// The composition root: switches between onboarding, login, and the authenticated app shell
/// based on `AuthSession.status`.
struct RootView: View {
    @Environment(AuthSession.self) private var session

    var body: some View {
        switch session.status {
        case .bootstrapping:
            ProgressView()
        case .needsBaseURL:
            OnboardingView()
        case .unauthenticated:
            LoginView()
        case .authenticated:
            AppShellView()
        }
    }
}

#Preview {
    RootView()
        .environment(AuthSession.shared)
}
