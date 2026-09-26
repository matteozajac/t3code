import SwiftUI

struct WatchRootView: View {
    @Bindable var store: WatchStore
    @State private var path = WatchDemoLaunch.initialThreadPath

    var body: some View {
        NavigationStack(path: $path) {
            ScrollViewReader { scrollProxy in
                List {
                    ConnectionSummaryView(snapshot: store.snapshot, phoneReachable: store.phoneReachable)
                        .listRowBackground(Color.clear)

                    if store.snapshot.threads.isEmpty {
                        ContentUnavailableView {
                            Label("Your tasks", systemImage: "bubble.left.and.bubble.right")
                        } description: {
                            Text("Open T3 Code on your iPhone. Your watch uses the same account and environments.")
                        }
                    } else {
                        StatusOverviewView(threads: store.snapshot.threads)
                            .id("status-overview")
                        ForEach(projects, id: \.self) { project in
                            Section(project) {
                                ForEach(threads(in: project)) { thread in
                                    NavigationLink(value: thread.id) {
                                        WatchThreadRow(thread: thread)
                                    }
                                }
                            }
                        }
                    }

                    Section {
                        Button("Refresh", systemImage: "arrow.clockwise") {
                            Task { await store.send(BridgeCommand(kind: .refresh)) }
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
                        Text("All connections go through T3 Code on your iPhone.")
                    }
                }
                .task(id: store.snapshot.isDemo) {
                    guard store.snapshot.isDemo, WatchDemoLaunch.includes("-demo-chart") else { return }
                    await Task.yield()
                    scrollProxy.scrollTo("status-overview", anchor: .top)
                }
            }
            .navigationTitle("T3 Watch")
            .navigationDestination(for: String.self) { threadID in
                WatchThreadDetailView(store: store, threadID: threadID)
            }
        }
    }

    private var projects: [String] {
        Array(Set(store.snapshot.threads.map(\.project))).sorted()
    }

    private func threads(in project: String) -> [WatchThread] {
        store.snapshot.threads.filter { $0.project == project }.sorted {
            if $0.status.displayOrder != $1.status.displayOrder {
                return $0.status.displayOrder < $1.status.displayOrder
            }
            return $0.title.localizedStandardCompare($1.title) == .orderedAscending
        }
    }
}
