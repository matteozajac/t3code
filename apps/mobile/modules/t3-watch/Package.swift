// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "T3WatchWire",
  platforms: [.macOS(.v15)],
  targets: [
    .target(name: "T3WatchWire", path: "ios",
      exclude: ["T3WatchBridgeModule.swift", "T3WatchAppDelegateSubscriber.swift", "WatchSessionCoordinator.swift"],
      sources: ["WatchWire.swift", "WatchReplyOnce.swift"]),
    .testTarget(name: "T3WatchWireTests", dependencies: ["T3WatchWire"], path: "Tests")
  ]
)
