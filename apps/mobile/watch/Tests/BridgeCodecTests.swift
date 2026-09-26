import Foundation
import Testing
@testable import T3WatchContracts

@Test(arguments: ["2026-09-26T12:00:00Z", "2026-09-26T12:00:00.123Z"])
func readsJavaScriptSnapshotDates(_ timestamp: String) throws {
    let json = """
    {"environment":"Mac","connection":"connected","updatedAt":"\(timestamp)","threads":[],"isDemo":false,"revision":1789999999999}
    """
    let snapshot = try BridgeCodec.decode(WatchSnapshot.self, from: Data(json.utf8))
    #expect(snapshot.updatedAt != nil)
    #expect(snapshot.revision == 1789999999999)
}

@Test func roundTripsOpaqueEnvironmentScopedCommand() throws {
    let command = BridgeCommand(kind: .prompt, threadID: "[\"remote:/one\",\"thread:two\"]", text: "Please finish 🧪")
    let data = try BridgeCodec.encode(BridgeEnvelope(command: command))
    let result = try BridgeCodec.decode(BridgeEnvelope.self, from: data)
    #expect(result.command?.id == command.id)
    #expect(result.command?.threadID == command.threadID)
    #expect(result.command?.text == command.text)
}

@Test func rejectsOversizedIncomingContext() {
    #expect(throws: BridgeCodec.CodecError.self) {
        try BridgeCodec.decode(WatchSnapshot.self, from: Data(repeating: 32, count: 55_001))
    }
}

@Test func acknowledgementCarriesCommandIdentityAndSnapshot() throws {
    let id = UUID()
    let envelope = BridgeEnvelope(reply: BridgeReply(succeeded: true, message: "Sent", snapshot: .demo), commandID: id)
    let decoded = try BridgeCodec.decode(BridgeEnvelope.self, from: BridgeCodec.encode(envelope))
    #expect(decoded.commandID == id)
    #expect(decoded.reply?.succeeded == true)
    #expect(decoded.reply?.snapshot?.threads.count == 3)
}
