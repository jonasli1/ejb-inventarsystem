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
        .navigationTitle("Ausleihe")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.errorMessage)
        .onChange(of: viewModel.isDeleted) { _, deleted in if deleted { dismiss() } }
    }

    @ViewBuilder
    private func content(_ loan: Loan) -> some View {
        List {
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
                ForEach(loan.items) { item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.inventoryItem.displayNumber).font(.subheadline.weight(.medium))
                        Text(item.inventoryItem.article.name).font(.caption).foregroundStyle(.secondary)
                        if item.returnedAt != nil {
                            Label("Zurückgegeben", systemImage: "checkmark.circle.fill")
                                .font(.caption2)
                                .foregroundStyle(.green)
                        }
                    }
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
