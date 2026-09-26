import * as NodeChildProcess from "node:child_process";
import type { ExpoConfig } from "expo/config";
import { describe, expect, it } from "vite-plus/test";

function resolveConfig(overrides: Record<string, string> = {}) {
  const result = NodeChildProcess.spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import config from ${JSON.stringify(new URL("./app.config.ts", import.meta.url).href)}; console.log(JSON.stringify(config));`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        APP_VARIANT: "production",
        T3CODE_IOS_PERSONAL_TEAM: "0",
        T3CODE_WATCH_COMPANION: "0",
        T3CODE_WATCH_BUNDLE_ID: "",
        T3CODE_WATCH_TEAM_ID: "",
        ...overrides,
      },
    },
  );
  if (result.status !== 0) throw new Error(result.stderr || "Config process failed");
  return JSON.parse(result.stdout) as ExpoConfig;
}

function pluginOptions(config: ExpoConfig, name: string) {
  const plugin = config.plugins?.find((entry) => Array.isArray(entry) && entry[0] === name);
  if (!Array.isArray(plugin)) throw new Error(`Missing ${name} plugin`);
  return plugin[1];
}

describe("watch companion fork identity", () => {
  it("keeps the upstream app configuration when the fork is disabled", () => {
    const config = resolveConfig();
    expect(config.name).toBe("T3 Code");
    expect(config.scheme).toBe("t3code");
    expect(config.ios?.bundleIdentifier).toBe("com.t3tools.t3code");
    expect(config.ios?.appleTeamId).toBe("ARK85ZXQ4Z");
    expect(config.ios?.privacyManifests).toBeUndefined();
    expect(config.owner).toBe("pingdotgg");
    expect(config.extra?.eas?.projectId).toBe("d763fcb8-d37c-41ea-a773-b54a0ab4a454");
    expect(config.plugins).not.toContain("./plugins/withWatchCompanion.cjs");
  });

  it("isolates installed identity, credentials and update delivery while retaining extensions", () => {
    const config = resolveConfig({ T3CODE_WATCH_COMPANION: "1" });
    expect(config.name).toBe("T3 Watch");
    expect(config.scheme).toBe("t3watch");
    expect(config.version).toBe("0.2.0");
    expect(config.ios?.buildNumber).toBe("2");
    expect(config.ios?.bundleIdentifier).toBe("com.matteozajac.T3Watch");
    expect(config.ios?.appleTeamId).toBe("4TCJLR98Y5");
    expect(config.ios?.privacyManifests).toEqual({ NSPrivacyAccessedAPITypes: [] });
    expect(config.ios?.entitlements?.["keychain-access-groups"]).toEqual([
      "$(AppIdentifierPrefix)com.matteozajac.T3Watch",
    ]);
    expect(config.updates).toEqual({ enabled: false });
    expect(config.owner).toBeUndefined();
    expect(config.extra?.eas).toBeUndefined();
    expect(config.extra?.iosPersonalTeamBuild).toBe(false);
    expect(config.extra?.watchCompanionBuild).toBe(true);
    expect(config.extra?.agentAwarenessPushEnabled).toBe(false);
    expect(config.plugins).toContain("./plugins/withWatchCompanion.cjs");
    expect(pluginOptions(config, "expo-widgets")).toMatchObject({
      bundleIdentifier: "com.matteozajac.T3Watch.widgets",
      groupIdentifier: "group.com.matteozajac.T3Watch",
      enablePushNotifications: false,
    });
    expect(pluginOptions(config, "expo-sharing")).toMatchObject({
      ios: {
        enabled: true,
        extensionBundleIdentifier: "com.matteozajac.T3Watch.sharing",
        appGroupId: "group.com.matteozajac.T3Watch",
      },
    });
    expect(config.ios?.associatedDomains).toEqual([]);
    expect(pluginOptions(config, "@clerk/expo")).toMatchObject({ appleSignIn: false });
  });

  it("applies an explicitly configured fork identity to every credential and extension boundary", () => {
    const config = resolveConfig({
      T3CODE_WATCH_COMPANION: "1",
      T3CODE_WATCH_BUNDLE_ID: "com.example.personal.watch",
      T3CODE_WATCH_TEAM_ID: "ABCDEFGHIJ",
    });
    expect(config.ios?.bundleIdentifier).toBe("com.example.personal.watch");
    expect(config.ios?.appleTeamId).toBe("ABCDEFGHIJ");
    expect(config.ios?.entitlements?.["keychain-access-groups"]).toEqual([
      "$(AppIdentifierPrefix)com.example.personal.watch",
    ]);
    expect(pluginOptions(config, "expo-widgets")).toMatchObject({
      bundleIdentifier: "com.example.personal.watch.widgets",
      groupIdentifier: "group.com.example.personal.watch",
    });
    expect(pluginOptions(config, "expo-sharing")).toMatchObject({
      ios: { extensionBundleIdentifier: "com.example.personal.watch.sharing" },
    });
  });

  it("rejects the free-team mode instead of silently dropping companion capabilities", () => {
    expect(() =>
      resolveConfig({ T3CODE_WATCH_COMPANION: "1", T3CODE_IOS_PERSONAL_TEAM: "1" }),
    ).toThrow("T3 Watch requires a paid developer team");
  });

  const malformedIdentities: Record<string, string>[] = [
    { T3CODE_WATCH_BUNDLE_ID: "not a bundle" },
    { T3CODE_WATCH_TEAM_ID: "not-a-team" },
  ];
  it.each(malformedIdentities)("rejects malformed signing identity %j", (overrides) => {
    expect(() => resolveConfig({ T3CODE_WATCH_COMPANION: "1", ...overrides })).toThrow("must be");
  });
});
