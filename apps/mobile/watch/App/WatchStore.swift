import Foundation
import Observation

@MainActor @Observable
final class WatchStore {
    var snapshot = WatchSnapshot()
    var phoneReachable = false
    var isSending = false
    var feedback: String?
    var lastSendSucceeded = false
    private let bridge = ConnectivityTransport()
    private var started = false
    private let isDemoLaunch = WatchDemoLaunch.includes("-demo")

    init() {
        if WatchDemoLaunch.includes("-demo") {
            snapshot = .demo
            phoneReachable = true
        } else if let data = UserDefaults.standard.data(forKey: "lastSnapshot"),
                  let cached = try? BridgeCodec.decode(WatchSnapshot.self, from: data) {
            snapshot = cached
        }
    }

    func start() {
        guard !started, !isDemoLaunch else { return }
        started = true
        bridge.onReachability = { [weak self] reachable in
            guard let self else { return }
            let becameReachable = reachable && !self.phoneReachable
            self.phoneReachable = reachable
            if becameReachable {
                Task { await self.send(BridgeCommand(kind: .refresh)) }
            }
        }
        bridge.onSnapshot = { [weak self] snapshot in self?.receive(snapshot) }
        bridge.start()
    }

    func send(_ command: BridgeCommand) async {
        guard !isSending else { return }
        lastSendSucceeded = false
        guard !snapshot.isDemo else { feedback = "Preview only. Open T3 Code on iPhone to send."; return }
        guard bridge.reachable else { feedback = "Open T3 Code on your iPhone, then try again."; return }
        isSending = true
        feedback = "Sending through iPhone…"
        let reply = await bridge.send(command)
        if let snapshot = reply.snapshot { receive(snapshot) }
        feedback = reply.message
        lastSendSucceeded = reply.succeeded
        isSending = false
    }

    private func receive(_ snapshot: WatchSnapshot) {
        guard snapshot.revision >= self.snapshot.revision else { return }
        self.snapshot = snapshot
        if !snapshot.isDemo, let data = try? BridgeCodec.encode(snapshot) {
            UserDefaults.standard.set(data, forKey: "lastSnapshot")
        }
    }
}
