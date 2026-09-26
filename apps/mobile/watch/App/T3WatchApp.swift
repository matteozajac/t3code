import SwiftUI

@main
struct T3WatchApp: App {
    @State private var store = WatchStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            WatchRootView(store: store)
                .tint(.mint)
                .task { store.start() }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active, store.phoneReachable else { return }
                    Task { await store.send(BridgeCommand(kind: .refresh)) }
                }
        }
    }
}
