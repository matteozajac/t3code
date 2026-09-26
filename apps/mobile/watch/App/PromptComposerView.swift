import SwiftUI

struct PromptComposerView: View {
    @Bindable var store: WatchStore
    let threadID: String
    let threadTitle: String
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @State private var isReviewing = false
    @State private var attemptedSend = false
    @State private var isAwaitingReply = false
    @State private var sendFeedback: String?

    var body: some View {
        NavigationStack {
            List {
                Section("Reply to") {
                    Text(threadTitle)
                        .font(.headline)
                }
                if isReviewing {
                    Section("Review message") {
                        Text(trimmedDraft)
                            .fixedSize(horizontal: false, vertical: true)
                        Button("Edit", systemImage: "pencil") {
                            isReviewing = false
                        }
                        .disabled(store.isSending)
                    }
                    Section {
                        Button("Send", systemImage: "paperplane.fill") {
                            send()
                        }
                        .tint(.mint)
                        .disabled(!canSend)
                        if store.isSending {
                            ProgressView("Sending through iPhone")
                        } else if attemptedSend, let feedback = sendFeedback {
                            Text(feedback)
                                .font(.footnote)
                        }
                    }
                } else {
                    Section("Message") {
                        TextField("Type or dictate", text: $draft)
                            .accessibilityHint("Opens the system text input, including dictation and the keyboard on supported watches.")
                        Text("Use the watch keyboard or dictation, then review your message.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Button("Review", systemImage: "text.bubble") {
                            isReviewing = true
                            attemptedSend = false
                            sendFeedback = nil
                        }
                        .disabled(trimmedDraft.isEmpty || trimmedDraft.utf16.count > 2_000)
                    }
                }
                if trimmedDraft.utf16.count > 2_000 {
                    Text("Keep this message under 2,000 characters.")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
                if threadNeedsAttention {
                    Text("This task now needs an approval or a structured answer. Close this message and review the task first.")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
                if store.snapshot.isDemo {
                    Text("Preview only. Open T3 Code on your iPhone to send messages.")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                } else if !store.phoneReachable || store.snapshot.connection != .connected {
                    Text("Open T3 Code on your iPhone to send. Your message stays here while this screen is open.")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
            }
            .navigationTitle("Reply")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", systemImage: "xmark") { dismiss() }
                        .disabled(store.isSending)
                }
            }
        }
        .interactiveDismissDisabled(store.isSending)
        .onChange(of: store.isSending) { wasSending, isSending in
            if wasSending && !isSending && isAwaitingReply {
                finishSend()
            }
        }
    }

    private var trimmedDraft: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSend: Bool {
        !trimmedDraft.isEmpty && trimmedDraft.utf16.count <= 2_000 && !store.isSending &&
            store.phoneReachable && store.snapshot.connection == .connected && !store.snapshot.isDemo &&
            threadExists && !threadNeedsAttention
    }

    private var threadExists: Bool {
        store.snapshot.threads.contains { $0.id == threadID }
    }

    private var threadNeedsAttention: Bool {
        guard let thread = store.snapshot.threads.first(where: { $0.id == threadID }) else { return false }
        return thread.approval != nil || thread.needsStructuredInput
    }

    private func send() {
        guard canSend else { return }
        attemptedSend = true
        isAwaitingReply = true
        sendFeedback = nil
        let command = BridgeCommand(kind: .prompt, threadID: threadID, text: trimmedDraft)
        Task {
            await store.send(command)
            // A transport guard or synchronous error can end before SwiftUI observes the transition.
            if !store.isSending && isAwaitingReply {
                finishSend()
            }
        }
    }

    private func finishSend() {
        isAwaitingReply = false
        sendFeedback = store.feedback
        guard store.lastSendSucceeded else { return }
        draft = ""
        isReviewing = false
        dismiss()
    }
}
