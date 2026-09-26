import ExpoModulesCore

public final class T3WatchAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func subscriberDidRegister() {
    WatchSessionCoordinator.shared.start()
  }
}
