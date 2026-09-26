import SwiftUI

struct WatchThreadDetailView: View {
    @Bindable var store: WatchStore
    let threadID: String
    @State private var showsComposer = false

    var body: some View {
        ScrollViewReader { scrollProxy in
            List {
                if let thread {
                    Section {
                        Text(thread.title)
                            .font(.headline)
                        Label(thread.status.title, systemImage: thread.status.symbol)
                            .foregroundStyle(thread.status.tint)
                        ConnectionSummaryView(snapshot: store.snapshot, phoneReachable: store.phoneReachable)
                    }
                    if let progress = thread.progress,
                       progress.totalSteps > 0,
                       (0...progress.totalSteps).contains(progress.completedSteps) {
                        Section("Plan progress") {
                            PlanProgressView(progress: progress)
                                .id("plan-progress")
                        }
                    }
                    if let approval = thread.approval {
                        Section("Approval needed") {
                            ApprovalRequestView(store: store, threadID: threadID, approval: approval)
                        }
                    }
                    if thread.needsStructuredInput {
                        Section("Continue on iPhone") {
                            Label("Input needed", systemImage: "iphone")
                                .foregroundStyle(.orange)
                            Text("Open this task on your iPhone to answer its questions and review the details.")
                                .font(.footnote)
                        }
                    }
                    Section("Recent chat") {
                        if thread.messages.isEmpty {
                            Text("No messages loaded yet. Refresh from your iPhone.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(thread.messages) { message in
                                ChatMessageView(message: message)
                                    .id(message.id)
                            }
                        }
                    }
                    Section {
                        Button("Reply", systemImage: "square.and.pencil") {
                            showsComposer = true
                        }
                        .tint(.mint)
                        .disabled(thread.needsStructuredInput || thread.approval != nil)
                        Button("Refresh", systemImage: "arrow.clockwise") {
                            Task { await store.send(BridgeCommand(kind: .openThread, threadID: threadID)) }
                        }
                        .disabled(store.isSending || !store.phoneReachable || store.snapshot.isDemo)
                        if store.isSending {
                            ProgressView("Contacting iPhone")
                        }
                        if let feedback = store.feedback {
                            Text(feedback)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    } footer: {
                        Text("Code review and detailed changes stay on your iPhone or desktop.")
                    }
                } else {
                    ContentUnavailableView("Task unavailable", systemImage: "bubble.left", description: Text("Refresh your task list on iPhone."))
                }
            }
            .task(id: store.snapshot.isDemo) {
                guard store.snapshot.isDemo else { return }
                await Task.yield()
                if WatchDemoLaunch.includes("-demo-plan") {
                    scrollProxy.scrollTo("plan-progress", anchor: .top)
                } else if WatchDemoLaunch.includes("-demo-chat"),
                          let messageID = thread?.messages.last(where: { $0.role == "assistant" })?.id ?? thread?.messages.first?.id {
                    scrollProxy.scrollTo(messageID, anchor: .top)
                }
                if WatchDemoLaunch.includes("-demo-compose") {
                    showsComposer = true
                }
            }
        }
        .navigationTitle(thread?.project ?? "Task")
        .sheet(isPresented: $showsComposer) {
            PromptComposerView(store: store, threadID: threadID, threadTitle: thread?.title ?? "Task")
        }
        .task(id: threadID) {
            if !store.snapshot.isDemo {
                await store.send(BridgeCommand(kind: .openThread, threadID: threadID))
            }
        }
    }

    private var thread: WatchThread? {
        store.snapshot.threads.first { $0.id == threadID }
    }
}
