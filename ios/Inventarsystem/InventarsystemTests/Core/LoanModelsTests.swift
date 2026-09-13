import Testing
import Foundation
@testable import Inventarsystem

/// Decode tests using literal JSON captured from a live backend instance across a full loan
/// lifecycle (create -> issue -> return), the same real-shape-verification approach used for
/// the Inventory/RBAC models.
struct LoanModelsTests {
    @Test func decodesLoanWithEmbeddedItems() throws {
        let json = Data("""
        {"id":"d36ce48b-7346-4554-9bde-98f333a38a73","borrowerPersonId":null,"borrowerName":"Max Mustermann","borrowerStreet":"Teststr. 1","borrowerCity":"Musterstadt","borrowerEmail":"max@example.com","borrowerPhone":"0123456789","lentByUserId":"bc92f09e-9741-4341-8fc1-adc8115237b3","source":"internal","checkoutDate":"2026-09-12T20:23:04.702Z","dueDate":"2026-10-01T00:00:00.000Z","issuedAt":null,"returnedAt":null,"status":"approved","notes":null,"createdAt":"2026-09-12T20:23:04.725Z","updatedAt":"2026-09-12T20:23:04.725Z","deletedAt":null,"lentBy":{"id":"bc92f09e-9741-4341-8fc1-adc8115237b3","displayName":"System Administrator","email":"admin@example.com"},"items":[{"id":"b4963cd1-08eb-4514-85d0-d6accdb7b67d","loanId":"d36ce48b-7346-4554-9bde-98f333a38a73","inventoryItemId":"97e539c4-518b-4946-87df-99263ed1dc62","checkedOutCondition":null,"returnedCondition":null,"returnedAt":null,"approvedAt":"2026-09-12T20:23:04.728Z","approvedByUserId":"bc92f09e-9741-4341-8fc1-adc8115237b3","createdAt":"2026-09-12T20:23:04.728Z","inventoryItem":{"id":"97e539c4-518b-4946-87df-99263ed1dc62","articleId":"cb76e0d7-051d-4571-8173-24066a14d9ec","locationId":"cd865fed-0df8-42a8-a47e-29dd88cac24f","roomId":"e6d250b7-cede-4c39-afcf-67b245ef8438","ownerOrganizationId":"2607f183-7a00-4d4e-84f5-448a9cd6e54a","ownerUnitId":"b0bc7e87-56f5-46c0-8a9c-5674a5399b6e","inventoryNumber":"INV-KABEL-002","status":"available","serialNumber":null,"purchasePrice":null,"purchaseDate":null,"nextDguvV3Check":null,"notes":null,"parentItemId":null,"createdAt":"2026-09-12T16:21:06.680Z","updatedAt":"2026-09-12T16:21:06.680Z","deletedAt":null,"article":{"id":"cb76e0d7-051d-4571-8173-24066a14d9ec","name":"Stromkabel 5m","description":"d","notes":null,"aliases":[],"categoryId":"7445c6fc-f33e-4097-b4ae-0118ebe6f96d","unitOfMeasure":"Stück","manufacturer":null,"imageUrl":null,"attributes":null,"createdAt":"2026-09-12T16:21:06.633Z","updatedAt":"2026-09-12T16:21:06.633Z","deletedAt":null},"location":{"id":"cd865fed-0df8-42a8-a47e-29dd88cac24f","name":"Gemeindehaus","address":"a","createdAt":"2026-09-12T16:21:06.590Z","updatedAt":"2026-09-12T16:21:06.590Z","deletedAt":null},"room":{"id":"e6d250b7-cede-4c39-afcf-67b245ef8438","locationId":"cd865fed-0df8-42a8-a47e-29dd88cac24f","name":"Lager 1","createdAt":"2026-09-12T16:21:06.600Z","updatedAt":"2026-09-12T16:21:06.600Z","deletedAt":null},"ownerOrganization":{"id":"2607f183-7a00-4d4e-84f5-448a9cd6e54a","name":"Gemeinde A","createdAt":"2026-09-12T16:21:06.573Z","updatedAt":"2026-09-12T16:21:06.573Z","deletedAt":null},"ownerUnit":{"id":"b0bc7e87-56f5-46c0-8a9c-5674a5399b6e","organizationId":"2607f183-7a00-4d4e-84f5-448a9cd6e54a","name":"Technik-Team","createdAt":"2026-09-12T16:21:06.578Z","updatedAt":"2026-09-12T19:20:07.640Z","deletedAt":null},"parentItem":null},"approvedBy":{"id":"bc92f09e-9741-4341-8fc1-adc8115237b3","displayName":"System Administrator"}}]}
        """.utf8)

        let loan = try APICoding.decoder.decode(Loan.self, from: json)
        #expect(loan.status == .approved)
        #expect(loan.borrowerDisplayName == "Max Mustermann")
        #expect(loan.items.count == 1)
        #expect(loan.items.first?.inventoryItem.inventoryNumber == "INV-KABEL-002")
        #expect(loan.items.first?.approvedBy?.displayName == "System Administrator")
    }

    @Test func decodesLoanTemplateWithFullArticle() throws {
        let json = Data("""
        {"id":"7c5976ad-edf4-4d68-b13f-343d73858506","name":"Standard-Technikpaket","notes":"Testvorlage","createdById":"bc92f09e-9741-4341-8fc1-adc8115237b3","createdAt":"2026-09-12T20:24:03.603Z","updatedAt":"2026-09-12T20:24:03.603Z","items":[{"id":"6aa96b41-d7a9-4ff0-ab4e-ad1d4c4fde7f","templateId":"7c5976ad-edf4-4d68-b13f-343d73858506","articleId":"cb76e0d7-051d-4571-8173-24066a14d9ec","quantity":2,"article":{"id":"cb76e0d7-051d-4571-8173-24066a14d9ec","name":"Stromkabel 5m","description":"d","notes":null,"aliases":[],"categoryId":"x","unitOfMeasure":"Stück","manufacturer":null,"imageUrl":null,"attributes":null,"createdAt":"2026-09-12T16:21:06.633Z","updatedAt":"2026-09-12T16:21:06.633Z","deletedAt":null}}]}
        """.utf8)

        let template = try APICoding.decoder.decode(LoanTemplate.self, from: json)
        #expect(template.name == "Standard-Technikpaket")
        #expect(template.items.first?.quantity == 2)
        #expect(template.items.first?.article.name == "Stromkabel 5m")
    }

    @Test func decodesCalendarEntry() throws {
        let json = Data("""
        {"id":"d36ce48b-7346-4554-9bde-98f333a38a73","borrowerName":"Max Mustermann","borrowerPersonId":null,"status":"completed","checkoutDate":"2026-09-12T20:23:04.702Z","dueDate":"2026-10-01T00:00:00.000Z","itemCount":1}
        """.utf8)

        let entry = try APICoding.decoder.decode(CalendarLoanEntry.self, from: json)
        #expect(entry.status == .completed)
        #expect(entry.itemCount == 1)
    }

    @Test func createLoanInputEncodesSaveAsTemplateOnlyWhenNamed() throws {
        var input = CreateLoanInput(
            borrowerPersonId: nil, borrowerName: "X", borrowerStreet: "S", borrowerCity: "C",
            borrowerEmail: "e@x.de", borrowerPhone: "0", checkoutDate: nil, dueDate: Date(),
            notes: "", forceRequested: nil, items: [], saveAsTemplateName: ""
        )
        var data = try APICoding.encoder.encode(input)
        var json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        #expect(json?["saveAsTemplate"] == nil)

        input.saveAsTemplateName = "Mein Set"
        data = try APICoding.encoder.encode(input)
        json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let saveAsTemplate = json?["saveAsTemplate"] as? [String: Any]
        #expect(saveAsTemplate?["name"] as? String == "Mein Set")
    }
}
