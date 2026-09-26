import SwiftUI

extension TaskStatus {
    var tint: Color {
        switch self {
        case .working: .mint
        case .needsInput: .orange
        case .ready: .cyan
        case .idle: .gray
        case .failed: .red
        }
    }

    var displayOrder: Int {
        switch self {
        case .needsInput: 0
        case .working: 1
        case .failed: 2
        case .ready: 3
        case .idle: 4
        }
    }
}
