import SwiftUI

/// A small fixed palette (semantic system colors, not custom hex — see `BrandColor` for why)
/// so every status enum maps consistently, matching the reference frontend's `Badge.tsx`
/// semantics (green=available/completed-ish, blue=in-progress, amber=pending, red=problem,
/// gray=terminal/neutral, purple=in-flight).
nonisolated enum BadgeColorName: Sendable {
    case green, blue, amber, red, gray, purple

    var color: Color {
        switch self {
        case .green: return .green
        case .blue: return .blue
        case .amber: return .orange
        case .red: return .red
        case .gray: return .gray
        case .purple: return .purple
        }
    }
}

/// Conformed to by any status enum shown via `StatusBadge` — `InventoryStatus` (see
/// `InventoryModels.swift`) and `LoanStatus` (see `LoanModels.swift`) both do.
protocol BadgeStatus {
    var label: String { get }
    var badgeColorName: BadgeColorName { get }
}

extension InventoryStatus: BadgeStatus {
    var badgeColorName: BadgeColorName {
        switch self {
        case .available: return .green
        case .borrowed: return .blue
        case .maintenance: return .amber
        case .defect: return .red
        case .retired: return .gray
        case .installed: return .purple
        case .notLoanable: return .gray
        case .unknown: return .gray
        }
    }
}

/// A small colored capsule with the status's German label — used anywhere an `InventoryStatus`
/// or `LoanStatus` is shown (lists, detail headers, filters), single source of truth for color.
struct StatusBadge<Status: BadgeStatus>: View {
    let status: Status

    var body: some View {
        Text(status.label)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(status.badgeColorName.color.opacity(0.15))
            .foregroundStyle(status.badgeColorName.color)
            .clipShape(Capsule())
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 8) {
        ForEach(InventoryStatus.allCases, id: \.self) { status in
            StatusBadge(status: status)
        }
        ForEach(LoanStatus.allCases, id: \.self) { status in
            StatusBadge(status: status)
        }
    }
    .padding()
}
