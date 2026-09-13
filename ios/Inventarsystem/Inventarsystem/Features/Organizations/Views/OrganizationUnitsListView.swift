import SwiftUI

/// Tier 2 of the "two-tier owner" model — one Organisation's Untereinheiten. Pushed from
/// `OrganizationsListView`'s own `NavigationStack` (no `NavigationStack` of its own here), and
/// reads its data live off the shared `OrganizationsViewModel` by `organizationId` rather than
/// owning a separate fetch, so edits made here are immediately visible back on the parent
/// list's unit-count subtitle, and vice versa.
struct OrganizationUnitsListView: View {
    let organizationId: String
    @Bindable var viewModel: OrganizationsViewModel

    @Environment(AuthSession.self) private var session
    @State private var showCreate = false
    @State private var editingUnit: OrganizationUnit?
    @State private var deletingUnit: OrganizationUnit?

    private var canCreate: Bool { session.hasPermission("organizations.create") }
    private var canUpdate: Bool { session.hasPermission("organizations.update") }
    private var canDelete: Bool { session.hasPermission("organizations.delete") }

    private var organization: Organization? { viewModel.organization(id: organizationId) }
    private var units: [OrganizationUnit] { organization?.units ?? [] }

    var body: some View {
        content
            .navigationTitle(organization?.name ?? "Untereinheiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if canCreate {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showCreate = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityIdentifier("organizations.addUnitButton")
                    }
                }
            }
            .errorAlert($viewModel.errorMessage)
            .sheet(isPresented: $showCreate) {
                OrganizationNameFormSheet(title: "Neue Untereinheit") { name in
                    let success = await viewModel.createUnit(organizationId: organizationId, name: name)
                    return success ? nil : (viewModel.consumeErrorMessage() ?? "Untereinheit konnte nicht angelegt werden.")
                }
            }
            .sheet(item: $editingUnit) { unit in
                OrganizationNameFormSheet(title: "Untereinheit bearbeiten", initialName: unit.name) { name in
                    let success = await viewModel.updateUnit(organizationId: organizationId, unitId: unit.id, name: name)
                    return success ? nil : (viewModel.consumeErrorMessage() ?? "Untereinheit konnte nicht gespeichert werden.")
                }
            }
            .confirmationDialog(
                "Untereinheit „\(deletingUnit?.name ?? "")“ endgültig löschen? Dies kann nicht rückgängig gemacht werden.",
                isPresented: Binding(
                    get: { deletingUnit != nil },
                    set: { isPresented in if !isPresented { deletingUnit = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Endgültig löschen", role: .destructive) {
                    if let id = deletingUnit?.id {
                        Task { await viewModel.deleteUnit(organizationId: organizationId, unitId: id) }
                    }
                }
                Button("Abbrechen", role: .cancel) {}
            }
    }

    @ViewBuilder
    private var content: some View {
        if units.isEmpty {
            ContentUnavailableView("Keine Untereinheiten gefunden", systemImage: "person.2")
        } else {
            List {
                ForEach(units) { unit in
                    Text(unit.name)
                        .swipeActions(edge: .trailing, allowsFullSwipe: canDelete) {
                            if canDelete {
                                Button("Löschen", role: .destructive) { deletingUnit = unit }
                            }
                            if canUpdate {
                                Button("Bearbeiten") { editingUnit = unit }
                                    .tint(.blue)
                            }
                        }
                }
            }
            .listStyle(.plain)
        }
    }
}

#Preview {
    NavigationStack {
        OrganizationUnitsListView(organizationId: "preview-org", viewModel: OrganizationsViewModel())
    }
    .environment(AuthSession.shared)
}
