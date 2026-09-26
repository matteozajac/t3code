# Build the T3 Watch fork

This fork adds a native watchOS companion to the official iPhone app. The iPhone owns sign-in and all environment connections. Watch actions use the same authenticated client runtime as the phone. No separate host-pairing setup is needed for the watch.

## Local build

Use the Node and pnpm versions declared in the root `package.json`, Xcode with the watchOS 26 SDK, CocoaPods, and a paid Apple Developer team. Allow several gigabytes for JavaScript dependencies, CocoaPods, and Xcode build products.

1. Copy the root `.env.watch.example` to a root `.env.local`, preserving any unrelated local settings. The example contains public T3 Connect build configuration, not credentials. `T3CODE_WATCH_COMPANION=1` enables this fork's identity and watch target. Do not combine it with the free-team `T3CODE_IOS_PERSONAL_TEAM` option.
2. Install dependencies from the repository root with `pnpm install --frozen-lockfile`.
3. From `apps/mobile`, generate the native project with `./node_modules/.bin/expo prebuild --platform ios --no-install --no-clean`. Expo 57 cleans native files by default; `--no-clean` preserves installed Pods on subsequent runs.
4. From `apps/mobile/ios`, run `pod install`, then open `T3Watch.xcworkspace`.
5. Build the `T3Watch` scheme for the paired iPhone. It embeds `T3WatchCompanion`. Use Release for a standalone build with the JavaScript bundle included.

Watch sources live outside the generated `ios` directory so clean Expo prebuilds preserve them. The config plugin recreates the watch target and embeds it in the phone app. The personal defaults are `com.matteozajac.T3Watch`, its `.watchkitapp` companion, and team `4TCJLR98Y5`; `.env.watch.example` exposes identity overrides for other paid teams. Widgets and sharing use the same fork-specific prefix and app group. Automatic signing must provision those identifiers too.

Upstream OTA updates and EAS project ownership are disabled in this build: an upstream update must not replace the JavaScript watch bridge. Keep the phone and watch version/build numbers together when preparing a release.

## Connect and verify

Sign in to T3 Connect in the forked iPhone app and wait for an existing environment's tasks to load, then open the watch app. Open a task, read the recent conversation, and send a short reply using the native watch text field. Keyboard and dictation availability depend on watch model, language, and system settings.

A fork cannot inherit the official app's Keychain session. T3 Tools' production passkey association and native Apple sign-in configuration do not authorize this signing identity. The fork disables those entitlements and retains the existing login UI; verify a supported login method and the bundle-ID browser callback on a physical iPhone before distribution. No production Clerk or relay configuration is modified by this fork.

Keep the iPhone app open for reliable live updates. WatchConnectivity can wake native code while the React Native runtime is unavailable; in that case the bridge asks the user to open the phone app. Prompts are not queued for later execution or retried automatically. Cached tasks show their last update time. Signing out replaces watch content when the next snapshot reaches the watch.

The watch shows up to 30 recent nonarchived tasks and six recent user/assistant messages for the selected task. Charts use actual task states and plan steps; they do not estimate completion. Only short, complete approval descriptions that explicitly advertise one-time accept/decline actions are actionable. Other input requests, provider setup, diffs, and full history stay on phone or desktop.

The hosted relay's APNs credentials belong to T3 Tools, so hosted push registration is disabled for this fork. Completion/input-needed updates appear when the phone runtime observes them; always-on background alerts require separate push infrastructure and are outside this version.

Before shipping, verify the complete flow with a running T3 Connect environment and physical paired devices: login, refresh, a prompt and resulting agent reply, supported approval, logout/cache clearing, reconnect, and foreground/background transitions. Simulator builds and bridge fixtures alone do not establish those behaviors.
