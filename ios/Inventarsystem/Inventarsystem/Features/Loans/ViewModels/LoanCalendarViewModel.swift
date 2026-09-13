import Foundation
import Observation

@MainActor
@Observable
final class LoanCalendarViewModel {
    private(set) var visibleMonth = Calendar.current.dateInterval(of: .month, for: Date())!.start
    private(set) var entries: [CalendarLoanEntry] = []
    private(set) var isLoading = false
    var errorMessage: String?

    private let service: LoanServicing
    private let calendar = Calendar.current

    init(service: LoanServicing = LoanService()) {
        self.service = service
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        guard let interval = calendar.dateInterval(of: .month, for: visibleMonth) else { return }
        do {
            entries = try await service.fetchCalendar(from: interval.start, to: interval.end)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Kalender konnte nicht geladen werden."
        }
    }

    func goToPreviousMonth() async {
        visibleMonth = calendar.date(byAdding: .month, value: -1, to: visibleMonth) ?? visibleMonth
        await load()
    }

    func goToNextMonth() async {
        visibleMonth = calendar.date(byAdding: .month, value: 1, to: visibleMonth) ?? visibleMonth
        await load()
    }

    /// Every day in the visible month, padded to full weeks (leading days from the previous
    /// month, trailing days from the next) so the grid always renders complete rows.
    var daysInGrid: [Date] {
        guard let monthInterval = calendar.dateInterval(of: .month, for: visibleMonth) else { return [] }
        let firstWeekday = calendar.component(.weekday, from: monthInterval.start)
        // German calendars start the week on Monday; `firstWeekday` is 1=Sunday...7=Saturday.
        let leadingCount = (firstWeekday + 5) % 7
        guard let gridStart = calendar.date(byAdding: .day, value: -leadingCount, to: monthInterval.start) else { return [] }

        var days: [Date] = []
        var cursor = gridStart
        while days.count < 42 {
            days.append(cursor)
            cursor = calendar.date(byAdding: .day, value: 1, to: cursor) ?? cursor
        }
        return days
    }

    func isInVisibleMonth(_ day: Date) -> Bool {
        calendar.isDate(day, equalTo: visibleMonth, toGranularity: .month)
    }

    func entries(on day: Date) -> [CalendarLoanEntry] {
        entries.filter { entry in
            calendar.isDate(entry.checkoutDate, inSameDayAs: day)
                || (entry.dueDate.map { calendar.isDate($0, inSameDayAs: day) } ?? false)
        }
    }

    func hasEntries(on day: Date) -> Bool { !entries(on: day).isEmpty }
}
