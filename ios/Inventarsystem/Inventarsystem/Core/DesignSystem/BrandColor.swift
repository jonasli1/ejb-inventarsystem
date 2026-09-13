import SwiftUI

/// The app's single custom brand color, matching the reference frontend's `--color-brand-600`
/// token (`#3f4abf` light / `#7d89ee` dark) — already wired as the project's `AccentColor` asset,
/// so most UI (buttons, links, toggles, the selected tab) picks it up automatically via the
/// system tint mechanism and needs no explicit reference to this type. Use `BrandColor.accent`
/// directly only where a `Color` value is needed outside of tinting (e.g. custom drawing).
///
/// Deliberately not a full custom palette: everything else (backgrounds, grouping, separators)
/// uses standard semantic system colors, so the app keeps its native "klassisches iOS" look and
/// adapts correctly to Dark Mode, increased-contrast, and future OS appearance changes — brand
/// identity comes through the accent color, the logo, and terminology, not a bespoke palette
/// fighting the platform's own appearance system.
nonisolated enum BrandColor {
    static let accent = Color("AccentColor")
}
