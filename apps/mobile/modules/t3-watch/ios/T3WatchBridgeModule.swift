import ExpoModulesCore
import Foundation

public final class T3WatchBridgeModule: Module {
  private let listenerID = UUID()

  public func definition() -> ModuleDefinition {
    Name("T3WatchBridge")
    Events("onWatchCommand")

    // Expo schedules these closures on the declared queue. Keep the module itself
    // nonisolated to match BaseModule; only the WCSession coordinator owns actor state.
    AsyncFunction("publishSnapshot") { (json: String) throws in
      try MainActor.assumeIsolated {
        try WatchSessionCoordinator.shared.publish(json)
      }
    }.runOnQueue(.main)

    AsyncFunction("completeCommand") { (id: String, replyJSON: String) throws in
      try MainActor.assumeIsolated {
        try WatchSessionCoordinator.shared.complete(id, replyJSON: replyJSON)
      }
    }.runOnQueue(.main)

    AsyncFunction("setListenerReady") { [weak self, listenerID] (ready: Bool) in
      // Mirror Expo's EventEmitter boundary: only emit is called through this weak
      // reference. It schedules conversion and dispatch on JavaScriptActor and
      // accesses SDK-owned Sendable state, never the module's mutable state.
      nonisolated(unsafe) weak let emitter = self
      MainActor.assumeIsolated {
        WatchSessionCoordinator.shared.setListener(ready ? { id, commandJSON, expiresAt in
          emitter?.emit(event: "onWatchCommand", payload: [
            "id": id, "commandJSON": commandJSON, "expiresAt": expiresAt
          ] as [String: Any])
        } : nil, owner: listenerID)
      }
    }.runOnQueue(.main)

    OnDestroy { [listenerID] in
      Task { @MainActor in WatchSessionCoordinator.shared.setListener(nil, owner: listenerID) }
    }
  }
}
