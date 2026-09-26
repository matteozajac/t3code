import Foundation

public struct BridgeCommand: Codable, Sendable {
    public enum Kind: String, Codable, Sendable { case refresh, openThread, prompt, approve, deny }
    public var id: UUID
    public var kind: Kind
    public var threadID: String?
    public var text: String?
    public var requestID: String?
    public init(id: UUID = UUID(), kind: Kind, threadID: String? = nil,
                text: String? = nil, requestID: String? = nil) {
        self.id = id; self.kind = kind; self.threadID = threadID
        self.text = text; self.requestID = requestID
    }
}

public struct BridgeReply: Codable, Sendable {
    public var succeeded: Bool
    public var message: String
    public var snapshot: WatchSnapshot?
    public init(succeeded: Bool, message: String, snapshot: WatchSnapshot? = nil) {
        self.succeeded = succeeded; self.message = message; self.snapshot = snapshot
    }
}
