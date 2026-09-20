import SwiftUI

struct LoanCalendarView: View {
    @State private var viewModel = LoanCalendarViewModel()
    @State private var selectedDay: Date?

    private let weekdaySymbols = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
    private let columns = Array(repeating: GridItem(.flexible()), count: 7)

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Button { Task { await viewModel.goToPreviousMonth() } } label: { Image(systemName: "chevron.left") }
                Spacer()
                Text(viewModel.visibleMonth.formatted(.dateTime.month(.wide).year()))
                    .font(.headline)
                Spacer()
                Button { Task { await viewModel.goToNextMonth() } } label: { Image(systemName: "chevron.right") }
            }
            .padding(.horizontal)

            LazyVGrid(columns: columns) {
                ForEach(weekdaySymbols, id: \.self) { symbol in
                    Text(symbol).font(.caption).foregroundStyle(.secondary)
                }
                ForEach(viewModel.daysInGrid, id: \.self) { day in
                    Button {
                        selectedDay = day
                    } label: {
                        VStack(spacing: 2) {
                            Text(day.formatted(.dateTime.day()))
                                .font(.subheadline)
                                .foregroundStyle(viewModel.isInVisibleMonth(day) ? .primary : .tertiary)
                            Circle()
                                .fill(viewModel.hasEntries(on: day) ? Color.accentColor : .clear)
                                .frame(width: 5, height: 5)
                        }
                        .frame(maxWidth: .infinity, minHeight: 36)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)

            if let selectedDay {
                let dayEntries = viewModel.entries(on: selectedDay)
                List {
                    Section(selectedDay.formatted(date: .complete, time: .omitted)) {
                        if dayEntries.isEmpty {
                            Text("Keine Ausleihen an diesem Tag.").foregroundStyle(.secondary)
                        }
                        ForEach(dayEntries) { entry in
                            NavigationLink(value: entry.id) {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(entry.subject)
                                        Text("\(entry.itemCount) Objekt(e)").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    StatusBadge(status: entry.status)
                                }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            } else {
                Spacer()
            }
        }
        .navigationTitle("Kalender")
        .navigationDestination(for: String.self) { loanId in
            LoanDetailView(loanId: loanId)
        }
        .task { await viewModel.load() }
        .errorAlert($viewModel.errorMessage)
    }
}

#Preview {
    NavigationStack {
        LoanCalendarView()
    }
}
