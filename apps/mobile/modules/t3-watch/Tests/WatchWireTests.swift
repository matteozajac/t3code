import Foundation
import Synchronization
import Testing
@testable import T3WatchWire

@Test func logoutClearsCachedThreadContent() throws {
  let snapshot = try WatchWire.snapshot("""
    {"environment":"Private workspace","connection":"authenticationRequired","revision":5,"threads":[{"title":"private task"}]}
    """)
  let object = try #require(JSONSerialization.jsonObject(with: snapshot.data) as? [String: Any])
  #expect((object["threads"] as? [Any])?.isEmpty == true)
  #expect(object["environment"] as? String == "T3 Code")
  #expect(snapshot.revision == 5)
}

@Test func oversizedSnapshotIsRejected() {
  #expect(throws: WatchWire.WireError.self) {
    try WatchWire.snapshot(String(repeating: "x", count: 55_001))
  }
}

@Test func ackSurvivesSnapshotEnvelopeOverhead() throws {
  let id = UUID()
  let body = "{\"succeeded\":true,\"message\":\"Sent\",\"snapshot\":\"" + String(repeating: "x", count: 54_920) + "\"}"
  #expect(body.utf8.count < WatchWire.maximumPayloadBytes)
  let data = try WatchWire.reply(id: id, json: body)
  let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
  let reply = try #require(object["reply"] as? [String: Any])
  #expect(reply["succeeded"] as? Bool == true)
  #expect(reply["snapshot"] == nil)
  #expect(object["commandID"] as? String == id.uuidString)
}

@Test func timeoutAndCompletionReplyOnlyOnce() async {
  let calls = Mutex([Data]())
  let reply = WatchReplyOnce { data in calls.withLock { $0.append(data) } }
  await withTaskGroup(of: Void.self) { group in
    for value in 0..<100 {
      group.addTask { reply.send(Data([UInt8(value)])) }
    }
  }
  #expect(calls.withLock { $0.count } == 1)
}

@Test func duplicateAcknowledgementNeverReplaysAccountSnapshot() throws {
  let id = UUID()
  let original = try WatchWire.reply(id: id, json: """
    {"succeeded":true,"message":"Sent","snapshot":{"environment":"Previous account","threads":[{"title":"Private task"}]}}
    """)
  let cached = try WatchWire.acknowledgement(original)
  let envelope = try #require(JSONSerialization.jsonObject(with: cached) as? [String: Any])
  let reply = try #require(envelope["reply"] as? [String: Any])
  #expect(envelope["commandID"] as? String == id.uuidString)
  #expect(reply["succeeded"] as? Bool == true)
  #expect(reply["message"] as? String == "Sent")
  #expect(reply["snapshot"] == nil)
  #expect(String(decoding: cached, as: UTF8.self).contains("Private task") == false)
}
