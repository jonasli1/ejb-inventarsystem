import SwiftUI

struct BlackoutPeriodsView: View {
    @State private var viewModel = BlackoutPeriodsViewModel()
    @State private var showCreate = false

    var body: some View {
        List {
            if viewModel.periods.isEmpty {
                ContentUnavailableView("Keine Sperrzeiten", systemImage: "calendar.badge.exclamationmark")
            }
            ForEach(viewModel.periods) { period in
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(period.startDate.formatted(date: .abbreviated, time: .omitted)) – \(period.endDate.formatted(date: .abbreviated, time: .omitted))")
                        .font(.headline)
                    if let reason = period.reason { Text(reason).font(.caption).foregroundStyle(.secondary) }
                }
                .swipeActions {
                    Button(role: .destructive) { Task { await viewModel.delete(period) } } label: {
                        Label("Löschen", systemImage: "trash")
                    }
                }
            }
        }
        .navigationTitle("Sperrzeiten")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showCreate = true } label: { Image(systemName: "plus") }
            }
        }
        .task { await viewModel.load() }
        .errorAlert($viewModel.errorMessage)
        .sheet(isPresented: $showCreate) {
            BlackoutPeriodCreateView { start, end, reason in
                showCreate = false
                Task { await viewModel.create(startDate: start, endDate: end, reason: reason) }
            }
        }
    }
}

private struct BlackoutPeriodCreateView: View {
    var onSave: (Date, Date, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var startDate = Date()
    @State private var endDate = Date().addingTimeInterval(86400)
    @State private var reason = ""

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Von", selection: $startDate, displayedComponents: .date)
                DatePicker("Bis", selection: $endDate, displayedComponents: .date)
                TextField("Grund", text: $reason)
            }
            .navigationTitle("Neue Sperrzeit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") { onSave(startDate, endDate, reason) }
                }
            }
        }
    }
}
