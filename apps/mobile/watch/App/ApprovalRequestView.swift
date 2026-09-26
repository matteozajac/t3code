import SwiftUI

struct ApprovalRequestView: View {
    @Bindable var store: WatchStore
    let threadID: String
    let approval: WatchApproval
    @State private var showsConfirmation = false
    @State private var reviewedApproval: WatchApproval?

    var body: some View {
        VStack(alignment: .leading) {
            Text(approval.title)
                .font(.headline)
            Text(approval.detail)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
            Button("Respond to request", systemImage: "hand.raised") {
                reviewedApproval = approval
                showsConfirmation = true
            }
            .disabled(!canRespond)
            .confirmationDialog("Respond to this request?", isPresented: $showsConfirmation, titleVisibility: .visible) {
                Button("Allow once") {
                    respond(.approve)
                }
                .disabled(!canRespond || reviewedApproval != approval)
                Button("Deny", role: .destructive) {
                    respond(.deny)
                }
                .disabled(!canRespond || reviewedApproval != approval)
                Button("Cancel", role: .cancel) { }
            } message: {
                Text(reviewedApproval?.title ?? approval.title)
            }
            if !canRespond {
                Text(unavailableReason)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var canRespond: Bool {
        store.phoneReachable && store.snapshot.connection == .connected && !store.isSending && !store.snapshot.isDemo &&
            store.snapshot.threads.first(where: { $0.id == threadID })?.approval == approval
    }

    private func respond(_ kind: BridgeCommand.Kind) {
        guard canRespond, reviewedApproval == approval else { return }
        Task {
            await store.send(BridgeCommand(kind: kind, threadID: threadID, requestID: approval.id))
        }
    }

    private var unavailableReason: String {
        if store.snapshot.isDemo { return "Preview only." }
        if store.isSending { return "Waiting for iPhone…" }
        return "Connect through iPhone to respond."
    }
}
