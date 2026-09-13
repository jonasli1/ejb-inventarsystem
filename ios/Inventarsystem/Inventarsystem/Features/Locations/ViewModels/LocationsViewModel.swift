import Foundation
import Observation

/// Drives the Standorte list plus create/update/delete for both Standorte and their embedded
/// Räume. `GET /locations` already returns each Standort's Räume embedded (see
/// `LocationService`), so a single `load()` after any mutation keeps both the Standorte list and
/// any pushed Räume list (`RoomsListView`, which reads back into `locations` by id) in sync
/// without a second round trip.
@MainActor
@Observable
final class LocationsViewModel {
    private(set) var locations: [Location] = []
    private(set) var isLoading = false
    var errorMessage: String?

    private let service: LocationServicing

    init(service: LocationServicing = LocationService()) {
        self.service = service
    }

    func location(id: String) -> Location? {
        locations.first { $0.id == id }
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            locations = try await service.fetchAll()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Standorte konnten nicht geladen werden."
        }
    }

    // MARK: - Standorte

    func createLocation(name: String, address: String) async -> Bool {
        do {
            _ = try await service.create(name: name, address: address)
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Standort konnte nicht erstellt werden."
            return false
        }
    }

    func updateLocation(id: String, name: String, address: String) async -> Bool {
        do {
            _ = try await service.update(id: id, name: name, address: address)
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Standort konnte nicht aktualisiert werden."
            return false
        }
    }

    func deleteLocation(id: String) async {
        do {
            try await service.delete(id: id)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Standort konnte nicht gelöscht werden."
        }
    }

    // MARK: - Räume

    func createRoom(locationId: String, name: String) async -> Bool {
        do {
            _ = try await service.createRoom(locationId: locationId, name: name)
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Raum konnte nicht erstellt werden."
            return false
        }
    }

    func updateRoom(id: String, name: String) async -> Bool {
        do {
            _ = try await service.updateRoom(id: id, name: name)
            await load()
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Raum konnte nicht aktualisiert werden."
            return false
        }
    }

    func deleteRoom(id: String) async {
        do {
            try await service.deleteRoom(id: id)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Raum konnte nicht gelöscht werden."
        }
    }
}
