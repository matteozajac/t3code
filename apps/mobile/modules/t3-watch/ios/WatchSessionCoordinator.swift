import Foundation
import WatchConnectivity

@MainActor
final class WatchSessionCoordinator: NSObject, WCSessionDelegate {
  static let shared = WatchSessionCoordinator()
  private var started = false
  private var listener: ((String, String, Double) -> Void)?
  private var listenerOwner: UUID?
  private var latestSnapshot: Data?
  private var revision: Int64 = -1
  private var pending: [UUID: WatchReplyOnce] = [:]
  private var deadlines: [UUID: Task<Void, Never>] = [:]
  private var completed: [UUID: Data] = [:]
  private var completionOrder: [UUID] = []

  func start() {
    guard !started, WCSession.isSupported() else { return }
    started = true
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  func setListener(_ listener: ((String, String, Double) -> Void)?, owner: UUID) {
    start()
    // An old React Native module may be destroyed after its replacement is ready.
    if listener == nil, listenerOwner != owner { return }
    self.listener = listener
    listenerOwner = listener == nil ? nil : owner
    if listener == nil {
      for id in Array(pending.keys) {
        finish(id, data: WatchWire.failure(id: id,
          message: "The iPhone session changed. Open T3 Code and refresh the chat before trying again."))
      }
    }
  }

  func publish(_ json: String) throws {
    start()
    let snapshot = try WatchWire.snapshot(json)
    guard snapshot.revision >= revision else { return }
    revision = snapshot.revision
    latestSnapshot = snapshot.data
    try flushSnapshot()
  }

  private func flushSnapshot() throws {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated,
      WCSession.default.isPaired, WCSession.default.isWatchAppInstalled,
      let latestSnapshot else { return }
    try WCSession.default.updateApplicationContext(["snapshot": latestSnapshot])
  }

  func complete(_ idString: String, replyJSON: String) throws {
    guard let id = UUID(uuidString: idString), pending[id] != nil else { return }
    do {
      finish(id, data: try WatchWire.reply(id: id, json: replyJSON))
    } catch {
      finish(id, data: WatchWire.failure(id: id,
        message: "The iPhone response could not be delivered. Refresh the chat before trying again."))
      throw error
    }
  }

  private func receive(_ data: Data, reply: WatchReplyOnce) {
    guard data.count <= WatchWire.maximumPayloadBytes,
      let envelope = try? JSONDecoder().decode(WatchWireEnvelope.self, from: data) else {
      reply.send(WatchWire.failure(id: nil, message: "This watch request could not be read. Update both apps."))
      return
    }
    let command = envelope.command
    if let existing = completed[command.id] { reply.send(existing); return }
    guard pending[command.id] == nil else {
      reply.send(WatchWire.failure(id: command.id, message: "This request is already being handled. Refresh the chat."))
      return
    }
    guard let listener else {
      reply.send(WatchWire.failure(id: command.id, message: "Open T3 Code on your iPhone and wait for your tasks to load, then try again."))
      return
    }
    guard pending.count < 8, let encoded = try? JSONEncoder().encode(command),
      let commandJSON = String(data: encoded, encoding: .utf8) else {
      reply.send(WatchWire.failure(id: command.id, message: "The iPhone is busy. Refresh the chat and try again."))
      return
    }
    pending[command.id] = reply
    deadlines[command.id] = Task { [weak self] in
      do { try await Task.sleep(for: .seconds(20)) } catch { return }
      self?.finish(command.id, data: WatchWire.failure(id: command.id,
        message: "Delivery not confirmed. Open T3 Code on iPhone and refresh the chat before sending again."))
    }
    // Commands are delivered only to the currently mounted runtime. Never queue writes for later.
    listener(command.id.uuidString, commandJSON, Date().timeIntervalSince1970 * 1_000 + 20_000)
  }

  private func finish(_ id: UUID, data: Data) {
    guard let reply = pending.removeValue(forKey: id) else { return }
    deadlines.removeValue(forKey: id)?.cancel()
    completed[id] = (try? WatchWire.acknowledgement(data)) ?? WatchWire.failure(id: id,
      message: "This request was already handled. Refresh the chat before trying again.")
    completionOrder.append(id)
    if completionOrder.count > 32 { completed.removeValue(forKey: completionOrder.removeFirst()) }
    reply.send(data)
  }

  nonisolated func session(_ session: WCSession, didReceiveMessageData data: Data,
    replyHandler: @escaping (Data) -> Void) {
    let reply = WatchReplyOnce(replyHandler)
    Task { @MainActor in self.receive(data, reply: reply) }
  }

  nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState,
    error: (any Error)?) {
    Task { @MainActor in try? self.flushSnapshot() }
  }

  nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
    Task { @MainActor in try? self.flushSnapshot() }
  }

  nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
  nonisolated func sessionDidDeactivate(_ session: WCSession) { session.activate() }
}
