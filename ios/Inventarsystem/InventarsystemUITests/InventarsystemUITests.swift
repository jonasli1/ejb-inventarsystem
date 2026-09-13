//
//  InventarsystemUITests.swift
//  InventarsystemUITests
//

import XCTest

final class InventarsystemUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// End-to-end smoke test: first-run onboarding against a real (throwaway, local) backend,
    /// then local login, then logout — the full Milestone 1 golden path. Requires a reachable
    /// backend at `UITEST_BASE_URL`; skips itself if that isn't configured (e.g. plain `xcodebuild
    /// build` in CI without a live backend), rather than failing the whole suite.
    @MainActor
    func testOnboardingAndLocalLoginEndToEnd() throws {
        guard let baseURL = ProcessInfo.processInfo.environment["UITEST_BASE_URL"],
              let email = ProcessInfo.processInfo.environment["UITEST_ADMIN_EMAIL"],
              let password = ProcessInfo.processInfo.environment["UITEST_ADMIN_PASSWORD"]
        else {
            throw XCTSkip("UITEST_BASE_URL / UITEST_ADMIN_EMAIL / UITEST_ADMIN_PASSWORD not set — skipping live-backend UI test.")
        }

        let app = XCUIApplication()
        app.launchEnvironment["RESET_STATE_FOR_UITESTS"] = "1"
        app.launch()

        let serverField = app.textFields["onboarding.serverAddressField"]
        XCTAssertTrue(serverField.waitForExistence(timeout: 5))
        serverField.tap()
        serverField.typeText(baseURL)

        app.buttons["onboarding.continueButton"].tap()

        let emailField = app.textFields["login.emailField"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 10))
        emailField.tap()
        emailField.typeText(email)

        let passwordField = app.secureTextFields["login.passwordField"]
        passwordField.tap()
        passwordField.typeText(password)

        app.buttons["login.submitButton"].tap()

        // Lands on Dashboard first — capture it for visual review (e.g. that the stat tiles
        // render at a uniform height regardless of content).
        let dashboardTab = app.tabBars.buttons["Dashboard"]
        XCTAssertTrue(dashboardTab.waitForExistence(timeout: 10))
        let dashboardScreenshot = XCTAttachment(screenshot: app.screenshot())
        dashboardScreenshot.name = "Dashboard"
        dashboardScreenshot.lifetime = .keepAlways
        add(dashboardScreenshot)

        // Milestone 4 checkpoint: browse into the Inventar list, open a known seeded item,
        // confirm its detail renders, edit a field, save, and confirm the change stuck.
        let inventoryTab = app.tabBars.buttons["Inventar"]
        XCTAssertTrue(inventoryTab.waitForExistence(timeout: 10))
        inventoryTab.tap()

        // First row in natural-sort order — visible without scrolling, unlike e.g. the
        // Mischpult item further down the (correctly naturally-sorted) list.
        let knownRow = app.staticTexts["INV-KABEL-001"]
        XCTAssertTrue(knownRow.waitForExistence(timeout: 10))
        knownRow.tap()

        // SwiftUI's `LabeledContent` exposes as one accessibility element combining both the
        // label and the value (confirmed via the failure accessibility dump while developing
        // this test), e.g. "Artikel, Stromkabel 5m" — not two separate static texts.
        XCTAssertTrue(app.staticTexts["Artikel, Stromkabel 5m"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Inventarnummer, INV-KABEL-001"].exists)

        let editButton = app.buttons["Bearbeiten"]
        XCTAssertTrue(editButton.waitForExistence(timeout: 5))
        editButton.tap()

        let serialField = app.textFields["Seriennummer"]
        XCTAssertTrue(serialField.waitForExistence(timeout: 5))
        let newSerial = "X32-UITEST-\(Int.random(in: 1000...9999))"
        serialField.tap()
        serialField.clearAndTypeText(newSerial)

        app.buttons["Fertig"].tap()
        XCTAssertTrue(app.buttons["Bearbeiten"].waitForExistence(timeout: 10), "Should return to read-only mode after saving")
        XCTAssertTrue(
            app.staticTexts["Seriennummer, \(newSerial)"].waitForExistence(timeout: 5),
            "Edited serial number should be visible after saving and reloading"
        )

        // Back to the list, then log out.
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // Profil is not a tab — it only opens as a sheet via the person-icon button on the
        // Dashboard tab.
        app.tabBars.buttons["Dashboard"].tap()
        let profileButton = app.buttons["dashboard.profileButton"]
        XCTAssertTrue(profileButton.waitForExistence(timeout: 5))
        profileButton.tap()

        // Let the sheet's presentation animation fully settle before scrolling its content —
        // an element can exist in the tree slightly before its hosting sheet has finished
        // sliding into place.
        XCTAssertTrue(app.staticTexts["KONTO"].waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 0.5)

        // The Profile list is long enough (Konto/Anmeldemethoden/Passwort/Darstellung/
        // Benachrichtigungen sections) that "Abmelden" isn't in SwiftUI's initially-realized
        // viewport — a plain `waitForExistence` never finds an off-screen List row (the same
        // class of issue as the scrolled-off-screen inventory row noted elsewhere in this file).
        // Swiping on `app` itself doesn't reliably scroll content presented inside a `.sheet`
        // (confirmed via the failure's accessibility dump: the list stayed at its initial,
        // unscrolled position after several `app.swipeUp()` calls) — target the List's own
        // backing collection view instead.
        let logoutButton = app.buttons["shell.logoutButton"]
        app.collectionViews.firstMatch.swipeUpUntilVisible(logoutButton)
        XCTAssertTrue(logoutButton.waitForExistence(timeout: 10))
        logoutButton.tap()
        XCTAssertTrue(app.textFields["login.emailField"].waitForExistence(timeout: 5))
    }
}

private extension XCUIElement {
    /// `typeText` appends rather than replaces — this selects-all-then-types to genuinely
    /// replace a field's contents.
    func clearAndTypeText(_ text: String) {
        guard let currentValue = value as? String else {
            typeText(text)
            return
        }
        tap()
        let selectAll = String(repeating: XCUIKeyboardKey.delete.rawValue, count: currentValue.count)
        typeText(selectAll)
        typeText(text)
    }

    /// Scrolls this element (typically the app itself, scrolling whatever List/ScrollView is on
    /// screen) up until `target` appears in the accessibility tree, or gives up after a bounded
    /// number of swipes. SwiftUI Lists only realize rows near the current viewport, so a target
    /// further down genuinely doesn't exist yet — no amount of waiting substitutes for scrolling.
    ///
    /// Uses an explicit coordinate-based press-and-drag rather than the `swipeUp()` convenience
    /// method — confirmed by inspecting a failure's accessibility dump that `swipeUp()` was not
    /// actually scrolling content presented inside a `.sheet` (the list stayed at its initial,
    /// unscrolled position after several attempts, on both the app and the collection view
    /// itself), while a manual drag between two fixed points within the visible content area
    /// does scroll it.
    func swipeUpUntilVisible(_ target: XCUIElement, maxSwipes: Int = 12) {
        let start = coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
        let end = coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
        var attempts = 0
        while !target.exists && attempts < maxSwipes {
            start.press(forDuration: 0.1, thenDragTo: end)
            // Give the scroll animation time to actually settle before the next attempt (and
            // before re-checking `.exists`) — firing attempts back-to-back with no pause risked
            // cancelling/overlapping the in-flight scroll rather than compounding it, which is
            // the likely reason this looked like scrolling never happened at all.
            Thread.sleep(forTimeInterval: 0.4)
            attempts += 1
        }
    }
}
