import Foundation
import WatchConnectivity

@MainActor
final class ConnectivityTransport: NSObject, WCSessionDelegate {
    var onSnapshot: ((WatchSnapshot) -> Void)?
    var onReachability: ((Bool) -> Void)?
    var reachable: Bool { WCSession.isSupported() && WCSession.default.isReachable }
    private var pending: [UUID: CheckedContinuation<BridgeReply, Never>] = [:]
    private var deadlines: [UUID: Task<Void, Never>] = [:]

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func send(_ command: BridgeCommand) async -> BridgeReply {
        guard reachable else { return failure("Open T3 Code on your iPhone, then try again.") }
        guard let data = try? BridgeCodec.encode(BridgeEnvelope(command: command)),
              data.count <= BridgeCodec.maximumPayloadBytes else {
            return failure("This message is too long. Shorten it and try again.")
        }
        return await withCheckedContinuation { continuation in
            pending[command.id] = continuation
            deadlines[command.id] = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(25)) } catch { return }
                self?.finish(command.id, reply: BridgeReply(succeeded: false,
                    message: "Delivery not confirmed. Refresh the chat before trying again."))
            }
            WCSession.default.sendMessageData(data, replyHandler: { [weak self] data in
                let envelope = try? BridgeCodec.decode(BridgeEnvelope.self, from: data)
                Task { @MainActor in
                    guard envelope?.commandID == command.id, let reply = envelope?.reply else {
                        self?.finish(command.id, reply: BridgeReply(succeeded: false,
                            message: "The iPhone response could not be read. Refresh before sending again."))
                        return
                    }
                    self?.finish(command.id, reply: reply)
                }
            }, errorHandler: { [weak self] error in
                let isUnreachable = (error as NSError).code == WCError.Code.notReachable.rawValue
                Task { @MainActor in
                    self?.finish(command.id, reply: BridgeReply(succeeded: false, message: isUnreachable
                        ? "Open T3 Code on your iPhone, then try again."
                        : "Delivery could not be confirmed. Refresh before sending again."))
                }
            })
        }
    }

    private func finish(_ id: UUID, reply: BridgeReply) {
        guard let continuation = pending.removeValue(forKey: id) else { return }
        deadlines.removeValue(forKey: id)?.cancel()
        continuation.resume(returning: reply)
    }

    private func failure(_ message: String) -> BridgeReply {
        BridgeReply(succeeded: false, message: message)
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState,
                            error: (any Error)?) {
        let reachable = session.isReachable
        let data = session.receivedApplicationContext["snapshot"] as? Data
        let snapshot = data.flatMap { try? BridgeCodec.decode(WatchSnapshot.self, from: $0) }
        Task { @MainActor [weak self] in
            if let snapshot { self?.onSnapshot?(snapshot) }
            self?.onReachability?(reachable)
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor [weak self] in self?.onReachability?(reachable) }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        guard let data = context["snapshot"] as? Data,
              let snapshot = try? BridgeCodec.decode(WatchSnapshot.self, from: data) else { return }
        Task { @MainActor [weak self] in self?.onSnapshot?(snapshot) }
    }
}
