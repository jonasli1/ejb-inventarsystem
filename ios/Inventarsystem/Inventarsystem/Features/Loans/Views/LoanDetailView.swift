import SwiftUI

struct LoanDetailView: View {
    let loanId: String

    @Environment(AuthSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: LoanDetailViewModel
    @State private var showIssue = false
    @State private var showReturn = false
    @State private var showEdit = false
    @State private var showDeleteConfirm = false
    @State private var showResetConfirm = false

    init(loanId: String) {
        self.loanId = loanId
        _viewModel = State(initialValue: LoanDetailViewModel(loanId: loanId))
    }

    private var canManage: Bool { session.hasAnyPermission(["loans.manage", "loans.administer"]) }
    private var canSpend: Bool { session.hasAnyPermission(["loans.spend", "loans.administer"]) }
    private var canDelete: Bool { session.hasPermission("loans.delete") }

    var body: some View {
        Group {
            if let loan = viewModel.loan {
                content(loan)
            } else if viewModel.isLoading {
                ProgressView()
            } else {
                ContentUnavailableView("Ausleihe nicht gefunden", systemImage: "questionmark.folder")
            }
        }
        .navigationTitle(viewModel.loan?.subject ?? "Ausleihe")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.errorMessage)
        .onChange(of: viewModel.isDeleted) { _, deleted in if deleted { dismiss() } }
    }

    @ViewBuilder
    private func content(_ loan: Loan) -> some View {
        List {
            Section {
                LabeledContent("Betreff", value: loan.subject)
            }
            Section("Ausleiher") {
                LabeledContent("Name", value: loan.borrowerDisplayName)
                if let email = loan.borrowerEmail { LabeledContent("E-Mail", value: email) }
                if let phone = loan.borrowerPhone { LabeledContent("Telefon", value: phone) }
                LabeledContent("Status") { StatusBadge(status: loan.status) }
                LabeledContent("Ausgabedatum", value: loan.checkoutDate.formatted(date: .abbreviated, time: .omitted))
                if let dueDate = loan.dueDate {
                    LabeledContent("Rückgabedatum", value: dueDate.formatted(date: .abbreviated, time: .omitted))
                }
                if let notes = loan.notes, !notes.isEmpty {
                    LabeledContent("Notizen", value: notes)
                }
            }

            Section("Objekte") {
                let idsInLoan = Set(loan.items.map(\.inventoryItemId))
                ForEach(loan.items) { item in
                    let isAccessory = item.inventoryItem.parentItemId.map(idsInLoan.contains) ?? false
                    HStack(alignment: .top, spacing: 6) {
                        if isAccessory {
                            Image(systemName: "arrow.turn.down.right")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .padding(.top, 2)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(item.inventoryItem.displayNumber).font(.subheadline.weight(.medium))
                                if isAccessory {
                                    Text("Zubehör")
                                        .font(.caption2.weight(.medium))
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(.blue.opacity(0.15), in: Capsule())
                                        .foregroundStyle(.blue)
                                }
                            }
                            Text(item.inventoryItem.article.name).font(.caption).foregroundStyle(.secondary)
                            if item.returnedAt != nil {
                                Label("Zurückgegeben", systemImage: "checkmark.circle.fill")
                                    .font(.caption2)
                                    .foregroundStyle(.green)
                            }
                        }
                    }
                    .padding(.leading, isAccessory ? 16 : 0)
                }
            }

            Section {
                actionButtons(loan)
            }
        }
        .sheet(isPresented: $showIssue) {
            LoanIssueView(loan: loan, viewModel: viewModel) {
                showIssue = false
                Task { await viewModel.load() }
            }
        }
        .sheet(isPresented: $showReturn) {
            LoanReturnView(loan: loan, viewModel: viewModel) {
                showReturn = false
                Task { await viewModel.load() }
            }
        }
        .sheet(isPresented: $showEdit) {
            LoanCreateView(existingLoan: loan) { _ in
                showEdit = false
                Task { await viewModel.load() }
            }
        }
        .confirmationDialog(
            "Diese Ausleihe wirklich endgültig löschen? Dies kann nicht rückgängig gemacht werden und die Ausleihe verschwindet aus allen Ansichten.",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Endgültig löschen", role: .destructive) { Task { await viewModel.delete() } }
            Button("Abbrechen", role: .cancel) {}
        }
        .confirmationDialog(
            "Status wirklich auf „beantragt“ zurücksetzen?",
            isPresented: $showResetConfirm,
            titleVisibility: .visible
        ) {
            Button("Zurücksetzen", role: .destructive) { Task { await viewModel.resetStatus() } }
            Button("Abbrechen", role: .cancel) {}
        }
    }

    @ViewBuilder
    private func actionButtons(_ loan: Loan) -> some View {
        if loan.status == .requested && canManage {
            Button("Alle genehmigen") { Task { await viewModel.approve() } }
        }
        if loan.status == .approved && canSpend {
            Button("Ausgeben") { showIssue = true }
        }
        if loan.status == .issued && canSpend {
            Button("Rückgabe erfassen") { showReturn = true }
        }
        if loan.status != .completed && canManage {
            Button("Bearbeiten") { showEdit = true }
            Button("Status zurücksetzen", role: .destructive) { showResetConfirm = true }
        }
        if canDelete {
            Button("Endgültig löschen", role: .destructive) { showDeleteConfirm = true }
        }
    }
}
