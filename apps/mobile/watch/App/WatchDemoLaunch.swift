import Foundation

/// Preview navigation only; the store's demo snapshot also disables all remote actions.
enum WatchDemoLaunch {
    static var initialThreadPath: [String] {
        ["-demo-thread", "-demo-plan", "-demo-chat", "-demo-compose"].contains(where: includes)
            ? ["demo-1"] : []
    }

    static func includes(_ argument: String) -> Bool {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        return arguments.contains("-demo") && arguments.contains(argument)
        #else
        return false
        #endif
    }
}
