// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "T3WatchContracts",
    platforms: [.macOS(.v15), .watchOS(.v26)],
    targets: [
        .target(name: "T3WatchContracts", path: "Shared"),
        .testTarget(name: "T3WatchContractTests", dependencies: ["T3WatchContracts"], path: "Tests")
    ]
)
