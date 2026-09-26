import Foundation

struct WatchWireCommand: Codable, Sendable {
  enum Kind: String, Codable, Sendable { case refresh, openThread, prompt, approve, deny }
  let id: UUID
  let kind: Kind
  let threadID: String?
  let text: String?
  let requestID: String?
}

struct WatchWireEnvelope: Decodable, Sendable {
  let command: WatchWireCommand
}

enum WatchWire {
  static let maximumPayloadBytes = 55_000

  struct SnapshotHeader: Decodable {
    let revision: Int64
    let connection: String
  }

  struct ReplyHeader: Decodable {
    let succeeded: Bool
    let message: String
  }

  enum WireError: LocalizedError {
    case oversized, invalidSnapshot, invalidReply
    var errorDescription: String? {
      switch self {
      case .oversized: "The watch update is too large."
      case .invalidSnapshot: "The watch snapshot is invalid."
      case .invalidReply: "The watch reply is invalid."
      }
    }
  }

  static func snapshot(_ json: String) throws -> (data: Data, revision: Int64) {
    let data = Data(json.utf8)
    guard data.count <= maximumPayloadBytes else { throw WireError.oversized }
    let header = try JSONDecoder().decode(SnapshotHeader.self, from: data)
    guard header.revision >= 0,
      ["unpaired", "connecting", "connected", "offline", "authenticationRequired"].contains(header.connection),
      var object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      object["threads"] is [[String: Any]] else { throw WireError.invalidSnapshot }
    // Signing out must replace the last delivered context, including cached task content.
    if header.connection == "unpaired" || header.connection == "authenticationRequired" {
      object["threads"] = []
      object["environment"] = "T3 Code"
    }
    return (try JSONSerialization.data(withJSONObject: object), header.revision)
  }

  static func reply(id: UUID, json: String) throws -> Data {
    let data = Data(json.utf8)
    guard data.count <= maximumPayloadBytes else { throw WireError.oversized }
    _ = try JSONDecoder().decode(ReplyHeader.self, from: data)
    guard var reply = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw WireError.invalidReply
    }
    var envelope: [String: Any] = ["commandID": id.uuidString, "reply": reply]
    var encoded = try JSONSerialization.data(withJSONObject: envelope)
    if encoded.count > maximumPayloadBytes {
      // Acknowledgement of a completed action must not be lost to snapshot size.
      reply.removeValue(forKey: "snapshot")
      envelope["reply"] = reply
      encoded = try JSONSerialization.data(withJSONObject: envelope)
    }
    guard encoded.count <= maximumPayloadBytes else { throw WireError.oversized }
    return encoded
  }

  static func failure(id: UUID?, message: String) -> Data {
    var envelope: [String: Any] = ["reply": ["succeeded": false, "message": message]]
    if let id { envelope["commandID"] = id.uuidString }
    // Only fixed short strings and UUIDs are encoded here.
    return (try? JSONSerialization.data(withJSONObject: envelope)) ?? Data()
  }

  static func acknowledgement(_ data: Data) throws -> Data {
    guard let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let commandID = envelope["commandID"] as? String,
      let reply = envelope["reply"] as? [String: Any],
      let succeeded = reply["succeeded"] as? Bool,
      let message = reply["message"] as? String else { throw WireError.invalidReply }
    // Duplicate suppression outlives an account or environment change. Retain only
    // the action receipt; a cached response must never restore old conversation data.
    return try JSONSerialization.data(withJSONObject: [
      "commandID": commandID,
      "reply": ["succeeded": succeeded, "message": message]
    ])
  }
}
