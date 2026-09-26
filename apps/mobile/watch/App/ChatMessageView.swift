import SwiftUI

struct ChatMessageView: View {
    let message: WatchMessage

    var body: some View {
        VStack(alignment: .leading) {
            Text(speaker)
                .font(.footnote)
                .bold()
                .foregroundStyle(message.role == "assistant" ? .mint : .secondary)
            Text(formattedText)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private var speaker: String {
        switch message.role {
        case "assistant": "Agent"
        case "user": "You"
        default: "Update"
        }
    }

    private var formattedText: AttributedString {
        (try? AttributedString(
            markdown: message.text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(message.text)
    }
}
