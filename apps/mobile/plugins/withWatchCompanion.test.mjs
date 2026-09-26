import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeModule from "node:module";
import { afterEach, describe, expect, it } from "vite-plus/test";
import watchPlugin from "./withWatchCompanion.cjs";

const require = NodeModule.createRequire(import.meta.url);
const xcode = NodeModule.createRequire(require.resolve("expo/config-plugins"))("xcode");
const roots = [];
const config = {
  version: "0.2.0",
  ios: { bundleIdentifier: "com.example.watch", buildNumber: "2", appleTeamId: "ABCDEFGHIJ" },
};

afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-watch-project-test-"));
  roots.push(root);
  for (const folder of ["ios", "watch/App", "watch/Shared"]) {
    NodeFS.mkdirSync(NodePath.join(root, folder), { recursive: true });
  }
  NodeFS.writeFileSync(NodePath.join(root, "watch/App/App.swift"), "// App\n");
  NodeFS.writeFileSync(NodePath.join(root, "watch/Shared/Model.swift"), "// Model\n");
  const file = NodePath.join(root, "ios/project.pbxproj");
  NodeFS.copyFileSync(new URL("./fixtures/PhoneOnly.pbxproj", import.meta.url), file);
  return { root, project: xcode.project(file).parseSync() };
}

function roundTrip(project) {
  NodeFS.writeFileSync(project.filepath, project.writeSync());
  return xcode.project(project.filepath).parseSync();
}

function watchTarget(project) {
  return Object.entries(project.hash.project.objects.PBXNativeTarget).find(
    ([id, target]) =>
      !id.endsWith("_comment") && target.name.replaceAll('"', "") === "T3WatchCompanion",
  );
}

function sourcePaths(project, target) {
  const objects = project.hash.project.objects;
  const phase = target.buildPhases
    .map((ref) => objects.PBXSourcesBuildPhase[ref.value])
    .find(Boolean);
  return phase.files.map((ref) =>
    objects.PBXFileReference[objects.PBXBuildFile[ref.value].fileRef].path.replaceAll('"', ""),
  );
}

function projectSigningTeams(project) {
  const objects = project.hash.project.objects;
  const root = objects.PBXProject[project.hash.project.rootObject];
  return objects.XCConfigurationList[root.buildConfigurationList].buildConfigurations.map(
    (reference) => objects.XCBuildConfiguration[reference.value].buildSettings.DEVELOPMENT_TEAM,
  );
}

function expectWatchFilesInMainGroup(project, target) {
  const objects = project.hash.project.objects;
  const root = objects.PBXProject[project.hash.project.rootObject];
  const groups = objects.PBXGroup[root.mainGroup].children
    .map((reference) => objects.PBXGroup[reference.value])
    .filter((group) => group?.name?.replaceAll('"', "") === "Watch Companion");
  expect(groups).toHaveLength(1);
  expect(groups[0].path).toBeUndefined();
  const references = target.buildPhases.flatMap((reference) => {
    const phase =
      objects.PBXSourcesBuildPhase?.[reference.value] ??
      objects.PBXResourcesBuildPhase?.[reference.value];
    return phase?.files.map((file) => objects.PBXBuildFile[file.value].fileRef) ?? [];
  });
  expect(groups[0].children.map((reference) => reference.value)).toEqual(references);
}

describe("watch companion Xcode project generation", () => {
  it("builds the embedded watch as an explicit phone dependency in a fresh Expo project", () => {
    const { root, project } = fixture();
    expect(project.hash.project.objects.PBXTargetDependency).toBeUndefined();
    watchPlugin.addWatchTarget(project, config, root);
    const parsed = roundTrip(project);
    expect(projectSigningTeams(parsed)).toEqual(["ABCDEFGHIJ", "ABCDEFGHIJ"]);
    const objects = parsed.hash.project.objects;
    const [watchID, watch] = watchTarget(parsed);
    expectWatchFilesInMainGroup(parsed, watch);
    const phone = parsed.getFirstTarget().firstTarget;
    expect(
      phone.dependencies.map((ref) => objects.PBXTargetDependency[ref.value].target),
    ).toContain(watchID);
    const embed = phone.buildPhases
      .map((ref) => objects.PBXCopyFilesBuildPhase?.[ref.value])
      .find(Boolean);
    expect(embed.dstSubfolderSpec).toBe(16);
    expect(embed.dstPath).toBe('"$(CONTENTS_FOLDER_PATH)/Watch"');
    expect(embed.files.map((ref) => objects.PBXBuildFile[ref.value].fileRef)).toEqual([
      watch.productReference,
    ]);
    expect(objects.PBXFileReference[watch.productReference].sourceTree).toBe("BUILT_PRODUCTS_DIR");
    expect(objects.PBXFileReference[watch.productReference].explicitFileType).toBe(
      '"wrapper.application"',
    );
    expect(objects.PBXFileReference[watch.productReference].lastKnownFileType).toBeUndefined();
    for (const source of sourcePaths(parsed, watch)) {
      expect(NodeFS.existsSync(NodePath.resolve(root, "ios", source))).toBe(true);
    }
  });

  it("updates an existing target for the next release without duplicate phases or dependencies", () => {
    const { root, project } = fixture();
    watchPlugin.addWatchTarget(project, config, root);
    const parsed = roundTrip(project);
    const [id, watch] = watchTarget(parsed);
    const originalPhases = watch.buildPhases.map((ref) => ref.value);
    // Model the missing dependency in a previously generated target.
    parsed.getFirstTarget().firstTarget.dependencies = [];
    delete parsed.hash.project.objects.PBXTargetDependency;
    delete parsed.hash.project.objects.PBXContainerItemProxy;
    NodeFS.unlinkSync(NodePath.join(root, "watch/Shared/Model.swift"));
    NodeFS.writeFileSync(NodePath.join(root, "watch/Shared/NewModel.swift"), "// Updated model\n");
    const next = {
      version: "0.3.0",
      ios: { bundleIdentifier: "com.example.next", buildNumber: "3", appleTeamId: "1234567890" },
    };
    watchPlugin.addWatchTarget(parsed, next, root);
    const once = roundTrip(parsed);
    watchPlugin.addWatchTarget(once, next, root);
    const final = roundTrip(once);
    expect(projectSigningTeams(final)).toEqual([1234567890, 1234567890]);
    const objects = final.hash.project.objects;
    const [finalID, finalWatch] = watchTarget(final);
    expectWatchFilesInMainGroup(final, finalWatch);
    expect(finalID).toBe(id);
    expect(finalWatch.buildPhases.map((ref) => ref.value)).toEqual(originalPhases);
    expect(final.getFirstTarget().firstTarget.dependencies).toHaveLength(1);
    expect(final.getFirstTarget().firstTarget.buildPhases).toHaveLength(2);
    expect(sourcePaths(final, finalWatch)).toEqual([
      "../watch/App/App.swift",
      "../watch/Shared/NewModel.swift",
    ]);
    for (const ref of objects.XCConfigurationList[finalWatch.buildConfigurationList]
      .buildConfigurations) {
      expect(objects.XCBuildConfiguration[ref.value].buildSettings).toMatchObject({
        MARKETING_VERSION: "0.3.0",
        CURRENT_PROJECT_VERSION: 3,
        DEVELOPMENT_TEAM: 1234567890,
        PRODUCT_BUNDLE_IDENTIFIER: '"com.example.next.watchkitapp"',
        INFOPLIST_KEY_WKCompanionAppBundleIdentifier: "com.example.next",
      });
    }
  });
});
