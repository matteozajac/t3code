import SwiftUI

struct WatchThreadRow: View {
    let thread: WatchThread

    var body: some View {
        VStack(alignment: .leading) {
            Text(thread.title)
                .font(.headline)
                .lineLimit(3)
            Label(thread.status.title, systemImage: thread.status.symbol)
                .font(.footnote)
                .foregroundStyle(thread.status.tint)
            if let lastReply = thread.messages.last(where: { $0.role == "assistant" }) {
                Text(lastReply.text)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
