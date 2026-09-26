import Foundation

public extension WatchSnapshot {
    static var demo: Self {
        Self(environment: "MacBook Pro · Preview", connection: .connected, updatedAt: Date(), threads: [
            WatchThread(id: "demo-1", project: "T3 Watch", title: "Build the watch companion", status: .working,
                        progress: PlanProgress(step: "Verify the iPhone bridge", completedSteps: 2, totalSteps: 4),
                        messages: [WatchMessage(id: "m1", role: "user", text: "Keep the watch focused on tasks and short replies."),
                                   WatchMessage(id: "m2", role: "assistant", text: "The task list and chat are ready. I’m checking the connection through your iPhone next.")]),
            WatchThread(id: "demo-2", project: "Website", title: "Polish the landing page", status: .needsInput,
                        messages: [WatchMessage(id: "m3", role: "assistant", text: "The layout is ready. Please review the proposed changes on your phone.")], needsStructuredInput: true),
            WatchThread(id: "demo-3", project: "T3 Watch", title: "Review connection states", status: .ready,
                        messages: [WatchMessage(id: "m4", role: "assistant", text: "Added clear states for sign-in, connecting, and an unavailable host. All focused checks passed.")])
        ], isDemo: true)
    }
}
