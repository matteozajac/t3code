import Foundation

/// WatchConnectivity supplies a legacy callback on its private queue. Locking both
/// extraction and consumption makes this one-shot wrapper safe across that queue and MainActor.
final class WatchReplyOnce: @unchecked Sendable {
  private let lock = NSLock()
  private var callback: ((Data) -> Void)?

  init(_ callback: @escaping (Data) -> Void) { self.callback = callback }

  func send(_ data: Data) {
    lock.lock()
    let callback = self.callback
    self.callback = nil
    lock.unlock()
    callback?(data)
  }
}
