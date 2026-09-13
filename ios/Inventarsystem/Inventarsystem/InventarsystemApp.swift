//
//  InventarsystemApp.swift
//  Inventarsystem
//
//  Created by Jonas on 12.09.26.
//

import SwiftUI

@main
struct InventarsystemApp: App {
    @State private var session = AuthSession.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task {
                    await session.bootstrap()
                }
        }
    }
}
