import SwiftUI

struct LoansListView: View {
    @Environment(AuthSession.self) private var session
    @State private var viewModel = LoansListViewModel()
    @State private var showCreate = false
    @State private var showTemplates = false
    @State private var showBlackoutPeriods = false
    @State private var showCalendar = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.list.isLoading && viewModel.list.items.isEmpty {
                    ProgressView()
                } else if viewModel.list.items.isEmpty {
                    ContentUnavailableView("Keine Ausleihen", systemImage: "arrow.left.arrow.right")
                } else {
                    List {
                        ForEach(viewModel.list.items) { loan in
                            NavigationLink(value: loan.id) {
                                LoanRowView(loan: loan)
                            }
                        }
                        if viewModel.list.totalPages > 1 {
                            HStack {
                                Button("Zurück") { Task { await viewModel.list.loadPreviousPage() } }
                                    .disabled(!viewModel.list.hasPreviousPage)
                                Spacer()
                                Text("Seite \(viewModel.list.page) von \(viewModel.list.totalPages)")
                                    .font(.footnote).foregroundStyle(.secondary)
                                Spacer()
                                Button("Weiter") { Task { await viewModel.list.loadNextPage() } }
                                    .disabled(!viewModel.list.hasNextPage)
                            }
                        }
                    }
                    .refreshable { await viewModel.list.refresh() }
                }
            }
            .navigationTitle("Ausleihen")
            .navigationDestination(for: String.self) { loanId in
                LoanDetailView(loanId: loanId)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Picker("Status", selection: $viewModel.statusFilter) {
                            Text("Alle").tag(LoanStatus?.none)
                            ForEach([LoanStatus.requested, .approved, .issued, .completed], id: \.self) {
                                Text($0.label).tag(LoanStatus?.some($0))
                            }
                        }
                        Button("Kalender") { showCalendar = true }
                        Button("Vorlagen") { showTemplates = true }
                        if session.hasPermission("loans.administer") {
                            Button("Sperrzeiten") { showBlackoutPeriods = true }
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
                if session.hasAnyPermission(["loans.create", "loans.manage", "loans.administer"]) {
                    ToolbarItem(placement: .primaryAction) {
                        Button { showCreate = true } label: { Image(systemName: "plus") }
                    }
                }
            }
            .navigationDestination(isPresented: $showTemplates) { LoanTemplatesView() }
            .navigationDestination(isPresented: $showBlackoutPeriods) { BlackoutPeriodsView() }
            .navigationDestination(isPresented: $showCalendar) { LoanCalendarView() }
            .sheet(isPresented: $showCreate) {
                LoanCreateView { _ in
                    showCreate = false
                    Task { await viewModel.list.refresh() }
                }
            }
            .task { await viewModel.onAppear() }
        }
    }
}

private struct LoanRowView: View {
    let loan: Loan

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(loan.borrowerDisplayName).font(.body.weight(.medium))
                Spacer()
                StatusBadge(status: loan.status)
            }
            if let dueDate = loan.dueDate {
                Text("Rückgabe bis \(dueDate.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text("\(loan.items.count) Objekt(e)")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    LoansListView()
        .environment(AuthSession.shared)
}
