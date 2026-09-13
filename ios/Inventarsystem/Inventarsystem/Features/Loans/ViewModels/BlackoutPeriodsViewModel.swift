import Foundation
import Observation

/// Sperrzeiten — hard date ranges blocking all Ausleihe activity regardless of permission
/// tier. `loans.administer`-only, matching the reference frontend's calendar-page admin panel.
@MainActor
@Observable
final class BlackoutPeriodsViewModel {
    private(set) var periods: [BlackoutPeriod] = []
    var errorMessage: String?

    private let service: LoanServicing

    init(service: LoanServicing = LoanService()) {
        self.service = service
    }

    func load() async {
        do {
            periods = try await service.fetchBlackoutPeriods()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Sperrzeiten konnten nicht geladen werden."
        }
    }

    func create(startDate: Date, endDate: Date, reason: String) async {
        do {
            _ = try await service.createBlackoutPeriod(startDate: startDate, endDate: endDate, reason: reason.isEmpty ? nil : reason)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Sperrzeit konnte nicht angelegt werden."
        }
    }

    func delete(_ period: BlackoutPeriod) async {
        do {
            try await service.deleteBlackoutPeriod(id: period.id)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Sperrzeit konnte nicht gelöscht werden."
        }
    }
}
