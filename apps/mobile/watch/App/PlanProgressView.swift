import Charts
import SwiftUI

struct PlanProgressView: View {
    let progress: PlanProgress

    var body: some View {
        VStack(alignment: .leading) {
            Text("\(progress.completedSteps) of \(progress.totalSteps) steps")
                .font(.headline)
            Chart {
                BarMark(
                    xStart: .value("Start", 0),
                    xEnd: .value("Completed", progress.completedSteps),
                    y: .value("Plan", "Plan")
                )
                .foregroundStyle(.mint)
                BarMark(
                    xStart: .value("Remaining start", progress.completedSteps),
                    xEnd: .value("Total", progress.totalSteps),
                    y: .value("Plan", "Plan")
                )
                .foregroundStyle(.gray.opacity(0.35))
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .chartXScale(domain: 0...progress.totalSteps)
            .frame(height: 20)
            .clipShape(.capsule)
            .accessibilityHidden(true)
            Text(progress.step)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Plan progress: \(progress.completedSteps) of \(progress.totalSteps) steps complete. \(progress.step)")
    }
}
