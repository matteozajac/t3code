import Foundation

public struct WatchThread: Codable, Identifiable, Sendable, Equatable {
    public var id: String
    public var project: String
    public var title: String
    public var status: TaskStatus
    public var updatedAt: String
    public var progress: PlanProgress?
    public var messages: [WatchMessage]
    public var approval: WatchApproval?
    public var needsStructuredInput: Bool
    public var runtimeMode: String
    public var interactionMode: String

    public init(id: String, project: String, title: String, status: TaskStatus,
                updatedAt: String = "", progress: PlanProgress? = nil,
                messages: [WatchMessage] = [], approval: WatchApproval? = nil,
                needsStructuredInput: Bool = false, runtimeMode: String = "approval-required",
                interactionMode: String = "default") {
        self.id = id; self.project = project; self.title = title; self.status = status
        self.updatedAt = updatedAt; self.progress = progress; self.messages = messages
        self.approval = approval; self.needsStructuredInput = needsStructuredInput
        self.runtimeMode = runtimeMode; self.interactionMode = interactionMode
    }
}

public enum TaskStatus: String, CaseIterable, Codable, Sendable {
    case working, needsInput, ready, idle, failed
    public var title: String {
        switch self {
        case .working: "Working"
        case .needsInput: "Needs you"
        case .ready: "Ready"
        case .idle: "Idle"
        case .failed: "Failed"
        }
    }
    public var symbol: String {
        switch self {
        case .working: "circle.dotted.circle"
        case .needsInput: "hand.raised.fill"
        case .ready: "checkmark.circle.fill"
        case .idle: "pause.circle"
        case .failed: "exclamationmark.circle.fill"
        }
    }
}

public struct PlanProgress: Codable, Sendable, Equatable {
    public var step: String
    public var completedSteps: Int
    public var totalSteps: Int
    public init(step: String, completedSteps: Int, totalSteps: Int) {
        self.step = step; self.completedSteps = completedSteps; self.totalSteps = totalSteps
    }
}

public struct WatchMessage: Codable, Identifiable, Sendable, Equatable {
    public var id: String
    public var role: String
    public var text: String
    public init(id: String, role: String, text: String) {
        self.id = id; self.role = role; self.text = text
    }
}

public struct WatchApproval: Codable, Identifiable, Sendable, Equatable {
    public var id: String
    public var title: String
    public var detail: String
    public init(id: String, title: String, detail: String) {
        self.id = id; self.title = title; self.detail = detail
    }
}
