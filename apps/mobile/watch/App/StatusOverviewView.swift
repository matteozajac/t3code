import Charts
import SwiftUI

struct StatusOverviewView: View {
    let threads: [WatchThread]

    var body: some View {
        VStack(alignment: .leading) {
            Text("\(threads.count) tasks")
                .font(.headline)
            Chart(visibleStatuses, id: \.self) { status in
                BarMark(
                    x: .value("Tasks", count(for: status)),
                    y: .value("Status", status.title)
                )
                .foregroundStyle(status.tint)
                .cornerRadius(4)
                .annotation(position: .trailing) {
                    Text(count(for: status), format: .number)
                        .font(.footnote)
                        .foregroundStyle(.primary)
                }
                .accessibilityLabel(status.title)
                .accessibilityValue("\(count(for: status)) tasks")
            }
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .leading) { _ in
                    AxisValueLabel()
                }
            }
            .chartXScale(domain: 0...(maxCount + 1))
            .frame(height: chartHeight)
            .accessibilityLabel("Task status counts")
        }
        .padding(.vertical)
    }

    private var visibleStatuses: [TaskStatus] {
        TaskStatus.allCases.filter { count(for: $0) > 0 }
    }

    private var maxCount: Int {
        visibleStatuses.map { count(for: $0) }.max() ?? 1
    }

    private var chartHeight: CGFloat {
        CGFloat(max(visibleStatuses.count, 1)) * 30
    }

    private func count(for status: TaskStatus) -> Int {
        threads.filter { $0.status == status }.count
    }
}
