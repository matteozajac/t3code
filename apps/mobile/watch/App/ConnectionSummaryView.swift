import SwiftUI

struct ConnectionSummaryView: View {
    let snapshot: WatchSnapshot
    let phoneReachable: Bool

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            VStack(alignment: .leading) {
                if snapshot.isDemo {
                    Label("Preview data", systemImage: "eye")
                        .foregroundStyle(.orange)
                } else {
                    Label(connectionTitle(at: context.date), systemImage: connectionSymbol(at: context.date))
                        .foregroundStyle(isLive(at: context.date) ? Color.mint : Color.orange)
                }
                if let updatedAt = snapshot.updatedAt {
                    Text("Updated \(updatedAt, style: .relative) ago")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .font(.footnote)
            .accessibilityElement(children: .combine)
        }
    }

    private func isLive(at date: Date) -> Bool {
        snapshot.connection == .connected && phoneReachable && !isStale(at: date)
    }

    private func connectionTitle(at date: Date) -> String {
        guard phoneReachable else { return "Open T3 Code on iPhone" }
        if snapshot.connection == .connected && isStale(at: date) {
            return "Saved update · refresh"
        }
        return snapshot.connection.title
    }

    private func connectionSymbol(at date: Date) -> String {
        if snapshot.connection == .connected && phoneReachable && isStale(at: date) {
            return "clock.arrow.circlepath"
        }
        return isLive(at: date) ? "iphone" : "iphone.slash"
    }

    private func isStale(at date: Date) -> Bool {
        guard let updatedAt = snapshot.updatedAt else { return true }
        return date.timeIntervalSince(updatedAt) > 60
    }
}
