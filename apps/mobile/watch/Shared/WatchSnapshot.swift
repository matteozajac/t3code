import Foundation

public struct WatchSnapshot: Codable, Sendable, Equatable {
    public var environment: String
    public var connection: ConnectionState
    public var updatedAt: Date?
    public var threads: [WatchThread]
    public var isDemo: Bool
    public var revision: Int64 = 0

    public init(environment: String = "T3 Code", connection: ConnectionState = .unpaired,
                updatedAt: Date? = nil, threads: [WatchThread] = [], isDemo: Bool = false) {
        self.environment = environment
        self.connection = connection
        self.updatedAt = updatedAt
        self.threads = threads
        self.isDemo = isDemo
    }
}

public enum ConnectionState: String, Codable, Sendable {
    case unpaired, connecting, connected, offline, authenticationRequired

    public var title: String {
        switch self {
        case .unpaired: "Open T3 Code on iPhone"
        case .connecting: "Connecting"
        case .connected: "Connected through iPhone"
        case .offline: "Host unavailable"
        case .authenticationRequired: "Sign in on iPhone"
        }
    }
}
