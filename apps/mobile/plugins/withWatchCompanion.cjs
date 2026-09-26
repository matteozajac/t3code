const fs = require("node:fs");
const path = require("node:path");
const { withXcodeProject } = require("expo/config-plugins");

const TARGET = "T3WatchCompanion";
const unquote = (value) => value?.replaceAll('"', "");

function syncBuildPhase(project, files, type, name, target, options, destination) {
  const objects = project.hash.project.objects;
  const phases = objects.PBXNativeTarget[target].buildPhases;
  const existing = phases.find(
    (reference) =>
      objects[type]?.[reference.value] &&
      unquote(objects[type][reference.value].name ?? reference.comment) === name,
  );
  // node-xcode reuses existing file references and build files while collecting
  // the current source list, including files added since the previous prebuild.
  const generated = project.addBuildPhase(files, type, name, target, options, destination);
  if (!existing) return;
  Object.assign(objects[type][existing.value], generated.buildPhase);
  phases.splice(
    phases.findIndex((reference) => reference.value === generated.uuid),
    1,
  );
  delete objects[type][generated.uuid];
  delete objects[type][`${generated.uuid}_comment`];
}

function swiftFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? swiftFiles(file) : entry.name.endsWith(".swift") ? [file] : [];
  });
}

function syncWatchGroup(project, target, root) {
  const objects = project.hash.project.objects;
  const mainGroup = objects.PBXGroup[root.mainGroup];
  let reference = mainGroup.children.find(
    (child) => unquote(objects.PBXGroup[child.value]?.name) === "Watch Companion",
  );
  if (!reference) {
    const group = project.addPbxGroup([], '"Watch Companion"');
    reference = { value: group.uuid, comment: "Watch Companion" };
    mainGroup.children.push(reference);
  }
  // node-xcode serializes an omitted path as the literal string "undefined".
  // This is a logical group; all file paths remain relative to the project root.
  delete objects.PBXGroup[reference.value].path;
  // File references need group ancestry as well as build-phase membership.
  // CocoaPods resolves privacy manifests via PBXFileReference.real_path.
  const files = target.buildPhases.flatMap((phaseReference) => {
    const phase =
      objects.PBXSourcesBuildPhase?.[phaseReference.value] ??
      objects.PBXResourcesBuildPhase?.[phaseReference.value];
    return phase?.files ?? [];
  });
  objects.PBXGroup[reference.value].children = files.map((file) => {
    const fileRef = objects.PBXBuildFile[file.value].fileRef;
    cleanFileReference(objects.PBXFileReference[fileRef]);
    return { value: fileRef, comment: unquote(objects.PBXFileReference[fileRef].name) };
  });
}

function cleanFileReference(reference) {
  for (const [key, value] of Object.entries(reference)) {
    if (value === undefined || value === "undefined") delete reference[key];
  }
}

function addWatchTarget(project, config, projectRoot) {
  const objects = project.hash.project.objects;
  const existing = Object.entries(objects.PBXNativeTarget).find(
    ([id, target]) => !id.endsWith("_comment") && unquote(target.name) === TARGET,
  );

  const companion = config.ios?.bundleIdentifier;
  if (!companion) throw new Error("The watch companion needs the iOS app bundle identifier.");
  // Extensions added by later plugins inherit this team when they do not set one.
  const root = objects.PBXProject[project.hash.project.rootObject];
  const projectConfigurations = objects.XCConfigurationList[root.buildConfigurationList];
  for (const reference of projectConfigurations.buildConfigurations) {
    objects.XCBuildConfiguration[reference.value].buildSettings.DEVELOPMENT_TEAM =
      config.ios.appleTeamId;
  }
  const phone = project.getFirstTarget().uuid;
  // A fresh Expo project has neither section. node-xcode silently skips adding
  // target dependencies until both exist, leaving the watch outside the archive.
  objects.PBXTargetDependency ??= {};
  objects.PBXContainerItemProxy ??= {};
  const target = existing
    ? { uuid: existing[0], pbxNativeTarget: existing[1] }
    : project.addTarget(TARGET, "application", TARGET, `${companion}.watchkitapp`);
  cleanFileReference(objects.PBXFileReference[target.pbxNativeTarget.productReference]);
  if (
    !objects.PBXNativeTarget[phone].dependencies.some(
      (reference) => objects.PBXTargetDependency[reference.value]?.target === target.uuid,
    )
  ) {
    project.addTargetDependency(phone, [target.uuid]);
  }
  const sourceFiles = ["App", "Shared"]
    .flatMap((folder) => swiftFiles(path.join(projectRoot, "watch", folder)))
    .sort()
    .map((file) => path.relative(path.join(projectRoot, "ios"), file));

  // Keep sources outside generated ios/: Expo prebuild --clean can recreate the
  // native project without deleting the watch implementation.
  syncBuildPhase(project, sourceFiles, "PBXSourcesBuildPhase", "Sources", target.uuid);
  syncBuildPhase(
    project,
    ["../watch/App/Assets.xcassets", "../watch/App/PrivacyInfo.xcprivacy"],
    "PBXResourcesBuildPhase",
    "Resources",
    target.uuid,
  );
  syncBuildPhase(project, [], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);
  syncWatchGroup(project, target.pbxNativeTarget, root);
  syncBuildPhase(
    project,
    [`${TARGET}.app`],
    "PBXCopyFilesBuildPhase",
    "Embed Watch Content",
    phone,
    "watch2_app",
    '"$(CONTENTS_FOLDER_PATH)/Watch"',
  );

  const list = objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList];
  for (const reference of list.buildConfigurations) {
    const configuration = objects.XCBuildConfiguration[reference.value];
    const settings = configuration.buildSettings;
    delete settings.INFOPLIST_FILE;
    Object.assign(settings, {
      ASSETCATALOG_COMPILER_APPICON_NAME: "AppIcon",
      CLANG_ENABLE_MODULES: "YES",
      CODE_SIGN_STYLE: "Automatic",
      CURRENT_PROJECT_VERSION: config.ios.buildNumber ?? "1",
      DEVELOPMENT_TEAM: config.ios.appleTeamId,
      PRODUCT_BUNDLE_IDENTIFIER: `"${companion}.watchkitapp"`,
      GENERATE_INFOPLIST_FILE: "YES",
      INFOPLIST_KEY_CFBundleDisplayName: '"T3 Watch"',
      INFOPLIST_KEY_ITSAppUsesNonExemptEncryption: "NO",
      INFOPLIST_KEY_WKApplication: "YES",
      INFOPLIST_KEY_WKCompanionAppBundleIdentifier: companion,
      INFOPLIST_KEY_WKRunsIndependentlyOfCompanionApp: "NO",
      MARKETING_VERSION: config.version,
      SDKROOT: "watchos",
      SKIP_INSTALL: "YES",
      SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
      SWIFT_VERSION: "6.0",
      SWIFT_DEFAULT_ACTOR_ISOLATION: "nonisolated",
      SWIFT_STRICT_CONCURRENCY: "complete",
      SWIFT_OPTIMIZATION_LEVEL: configuration.name === "Debug" ? '"-Onone"' : '"-O"',
      TARGETED_DEVICE_FAMILY: "4",
      WATCHOS_DEPLOYMENT_TARGET: "26.0",
    });
  }
}

module.exports = function withWatchCompanion(config) {
  return withXcodeProject(config, (next) => {
    addWatchTarget(next.modResults, next, next.modRequest.projectRoot);
    return next;
  });
};

module.exports.addWatchTarget = addWatchTarget;
