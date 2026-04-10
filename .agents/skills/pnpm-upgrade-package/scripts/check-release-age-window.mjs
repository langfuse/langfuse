#!/usr/bin/env node

import { join } from "node:path";
import {
  findLocalPackageReferences,
  getRootPnpmControls,
  readWorkspaceConfig,
} from "./lib/workspace-utils.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const positional = args.filter((arg) => !arg.startsWith("--"));
const packageName = positional[0];
const requestedTargetVersion = positional[1] ?? null;

if (!packageName) {
  console.error(
    "Usage: node .agents/skills/pnpm-upgrade-package/scripts/check-release-age-window.mjs <package> [targetVersion] [--json]",
  );
  process.exit(1);
}

const repoRoot = process.cwd();
const registryCache = new Map();
const localReferenceCache = new Map();

const getLocalPackageReferences = (name) => {
  if (!localReferenceCache.has(name)) {
    localReferenceCache.set(name, findLocalPackageReferences(repoRoot, name));
  }

  return localReferenceCache.get(name);
};

const formatWorkspaceReferenceLine = (reference) => {
  const label = reference.workspaceName
    ? `${reference.path} (${reference.workspaceName})`
    : reference.path;
  const specs = reference.matches
    .map((match) => `${match.field}: ${match.spec}`)
    .join(", ");

  return `${label} -> ${specs}`;
};

const printSectionHeader = (title) => {
  console.log("");
  console.log(title);
};

function isPrerelease(version) {
  return version.includes("-");
}

function isExactVersion(spec) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(spec.trim());
}

function entryCoversVersion(entry, wantedPackage, wantedVersion) {
  if (entry === wantedPackage) return true;
  if (entry.endsWith("/*")) {
    const prefix = entry.slice(0, -1);
    return wantedPackage.startsWith(prefix);
  }
  if (!entry.startsWith(`${wantedPackage}@`)) return false;

  return entry
    .slice(wantedPackage.length + 1)
    .split("||")
    .map((part) => part.trim())
    .includes(wantedVersion);
}

async function fetchRegistryPackage(name) {
  if (registryCache.has(name)) return registryCache.get(name);

  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    {
      headers: {
        accept: "application/json",
        "user-agent": "langfuse-pnpm-upgrade-package-skill",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch ${name} from npm registry: ${response.status}`);
  }

  const json = await response.json();
  registryCache.set(name, json);
  return json;
}

function selectLatestInstallableVersion(metadata, thresholdMs) {
  const times = metadata.time ?? {};
  const candidates = Object.keys(metadata.versions ?? {})
    .filter((version) => times[version] && !isPrerelease(version))
    .map((version) => ({
      version,
      publishedAt: times[version],
      publishedAtMs: Date.parse(times[version]),
    }))
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs);

  return (
    candidates.find((candidate) => candidate.publishedAtMs <= thresholdMs) ??
    null
  );
}

async function analyzeExactVersionRequirement(
  name,
  version,
  thresholdMs,
  excludeEntries,
) {
  const metadata = await fetchRegistryPackage(name);
  const publishedAt = metadata.time?.[version] ?? null;
  const publishedAtMs = publishedAt ? Date.parse(publishedAt) : null;
  const matchingExcludeEntries = excludeEntries.filter((entry) =>
    entryCoversVersion(entry, name, version),
  );

  return {
    name,
    version,
    publishedAt,
    isYoungerThanMinimumReleaseAge:
      publishedAtMs != null ? publishedAtMs > thresholdMs : null,
    matchingExcludeEntries,
    suggestedExclude:
      publishedAtMs != null &&
      publishedAtMs > thresholdMs &&
      matchingExcludeEntries.length === 0
        ? `${name}@${version}`
        : null,
  };
}

function printWorkspaceReferences(title, references) {
  printSectionHeader(title);
  if (references.length === 0) {
    console.log("- none");
    return;
  }

  for (const reference of references) {
    console.log(`- ${formatWorkspaceReferenceLine(reference)}`);
  }
}

function printRootPnpmControls(rootPnpm) {
  printSectionHeader("Root pnpm controls:");
  if (
    rootPnpm.overrideMatches.length === 0 &&
    rootPnpm.patchedDependencyMatches.length === 0
  ) {
    console.log("- none");
    return;
  }

  for (const match of rootPnpm.overrideMatches) {
    console.log(`- override ${match.selector}: ${match.value}`);
  }
  for (const match of rootPnpm.patchedDependencyMatches) {
    console.log(`- patched dependency ${match.selector}: ${match.value}`);
  }
}

function printExactVersionSection(title, entries, { includeWorkspace = false } = {}) {
  printSectionHeader(title);
  if (entries.length === 0) {
    console.log("- none");
    return;
  }

  for (const entry of entries) {
    const ageText =
      entry.isYoungerThanMinimumReleaseAge == null
        ? "unknown"
        : entry.isYoungerThanMinimumReleaseAge
          ? "too new"
          : "old enough";
    const suffix = includeWorkspace
      ? `; ${entry.isInstalledInWorkspace ? "installed in workspace" : "not installed in workspace"}`
      : "";

    console.log(`- ${entry.name}@${entry.version} (${ageText}${suffix})`);
    if (entry.publishedAt) {
      console.log(`  published at: ${entry.publishedAt}`);
    }
    if (includeWorkspace && entry.workspaceReferences.length > 0) {
      for (const reference of entry.workspaceReferences) {
        console.log(
          `  workspace reference: ${formatWorkspaceReferenceLine(reference)}`,
        );
      }
    }
    if (entry.matchingExcludeEntries.length > 0) {
      console.log(
        `  matching exclude entries: ${entry.matchingExcludeEntries.join(", ")}`,
      );
    }
    if (entry.suggestedExclude) {
      console.log(`  suggested exclude: ${entry.suggestedExclude}`);
    }
  }
}

function printRangeSection(title, entries) {
  printSectionHeader(title);
  if (entries.length === 0) {
    console.log("- none");
    return;
  }

  for (const entry of entries) {
    console.log(`- ${entry.name}: ${entry.spec} (manual review)`);
    if (entry.workspaceReferences?.length > 0) {
      for (const reference of entry.workspaceReferences) {
        console.log(
          `  workspace reference: ${formatWorkspaceReferenceLine(reference)}`,
        );
      }
    }
  }
}

const workspaceConfig = readWorkspaceConfig(join(repoRoot, "pnpm-workspace.yaml"));
const minimumReleaseAgeMinutes = workspaceConfig.minimumReleaseAge ?? 0;
const thresholdMs = Date.now() - minimumReleaseAgeMinutes * 60 * 1000;
const packageMetadata = await fetchRegistryPackage(packageName);
const latestVersion = packageMetadata["dist-tags"]?.latest ?? null;
const targetVersion = requestedTargetVersion ?? latestVersion;

if (!targetVersion) {
  console.error(`Could not resolve a target version for ${packageName}.`);
  process.exit(1);
}

if (!packageMetadata.versions?.[targetVersion]) {
  console.error(`Version ${targetVersion} was not found for ${packageName}.`);
  process.exit(1);
}

const packageWorkspaceReferences = getLocalPackageReferences(packageName);
const rootPnpm = getRootPnpmControls(repoRoot, packageName);
const latestInstallableWithoutNewExclude = selectLatestInstallableVersion(
  packageMetadata,
  thresholdMs,
);
const targetPublishedAt = packageMetadata.time?.[targetVersion] ?? null;
const targetPublishedAtMs = targetPublishedAt ? Date.parse(targetPublishedAt) : null;
const matchingPackageExcludeEntries =
  workspaceConfig.minimumReleaseAgeExclude.filter((entry) =>
    entryCoversVersion(entry, packageName, targetVersion),
  );

const targetManifest = packageMetadata.versions[targetVersion];
const exactDirectDependencies = await Promise.all(
  Object.entries(targetManifest.dependencies ?? {})
    .filter(([, spec]) => isExactVersion(spec))
    .map(([name, version]) =>
      analyzeExactVersionRequirement(
        name,
        version,
        thresholdMs,
        workspaceConfig.minimumReleaseAgeExclude,
      ),
    ),
);
const rangeDirectDependencies = Object.entries(targetManifest.dependencies ?? {})
  .filter(([, spec]) => !isExactVersion(spec))
  .map(([name, spec]) => ({
    name,
    spec,
    note: "Manual review: range-based dependency",
  }));

const exactPeerDependencies = await Promise.all(
  Object.entries(targetManifest.peerDependencies ?? {})
    .filter(([, spec]) => isExactVersion(spec))
    .map(async ([name, version]) => {
      const workspaceReferences = getLocalPackageReferences(name);
      const analysis = await analyzeExactVersionRequirement(
        name,
        version,
        thresholdMs,
        workspaceConfig.minimumReleaseAgeExclude,
      );

      return {
        ...analysis,
        workspaceReferences,
        isInstalledInWorkspace: workspaceReferences.length > 0,
        suggestedExclude:
          workspaceReferences.length > 0 ? analysis.suggestedExclude : null,
      };
    }),
);
const rangePeerDependencies = Object.entries(targetManifest.peerDependencies ?? {})
  .filter(([, spec]) => !isExactVersion(spec))
  .map(([name, spec]) => ({
    name,
    spec,
    workspaceReferences: getLocalPackageReferences(name),
    note: "Manual review: range-based peer dependency",
  }));

const result = {
  packageName,
  targetVersion,
  targetWasExplicitlyProvided: requestedTargetVersion != null,
  packageWorkspaceReferences,
  rootPnpm,
  minimumReleaseAgeMinutes,
  thresholdIso: new Date(thresholdMs).toISOString(),
  latestRegistryVersion: latestVersion,
  latestRegistryPublishedAt:
    latestVersion != null ? packageMetadata.time?.[latestVersion] ?? null : null,
  latestInstallableWithoutNewExclude,
  targetPublishedAt,
  targetIsYoungerThanMinimumReleaseAge:
    targetPublishedAtMs != null ? targetPublishedAtMs > thresholdMs : null,
  matchingPackageExcludeEntries,
  suggestedPackageExclude:
    targetPublishedAtMs != null &&
    targetPublishedAtMs > thresholdMs &&
    matchingPackageExcludeEntries.length === 0
      ? `${packageName}@${targetVersion}`
      : null,
  exactDirectDependencies,
  rangeDirectDependencies,
  exactPeerDependencies,
  rangePeerDependencies,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(`Package: ${packageName}`);
console.log(
  `Target version: ${targetVersion}${
    requestedTargetVersion
      ? ""
      : " (resolved latest; still ask before bumping if version was omitted)"
  }`,
);

printWorkspaceReferences(
  "Target package workspace references:",
  packageWorkspaceReferences,
);
printRootPnpmControls(rootPnpm);

printSectionHeader("Release-age window:");
console.log(`minimumReleaseAge: ${minimumReleaseAgeMinutes} minutes`);
console.log(`Threshold: ${result.thresholdIso}`);
console.log(`Latest registry version: ${result.latestRegistryVersion ?? "unknown"}`);
if (result.latestRegistryPublishedAt) {
  console.log(`Latest registry published at: ${result.latestRegistryPublishedAt}`);
}
if (latestInstallableWithoutNewExclude) {
  console.log(
    `Latest installable without new exclude: ${latestInstallableWithoutNewExclude.version} (${latestInstallableWithoutNewExclude.publishedAt})`,
  );
} else {
  console.log("Latest installable without new exclude: none found");
}
console.log(`Target published at: ${targetPublishedAt ?? "unknown"}`);
console.log(
  `Target is younger than minimumReleaseAge: ${
    result.targetIsYoungerThanMinimumReleaseAge == null
      ? "unknown"
      : result.targetIsYoungerThanMinimumReleaseAge
        ? "yes"
        : "no"
  }`,
);
if (matchingPackageExcludeEntries.length > 0) {
  console.log("Matching package exclude entries:");
  for (const entry of matchingPackageExcludeEntries) {
    console.log(`- ${entry}`);
  }
} else {
  console.log("Matching package exclude entries: none");
}
if (result.suggestedPackageExclude) {
  console.log(`Suggested package exclude: ${result.suggestedPackageExclude}`);
}

printExactVersionSection("Exact direct dependencies:", exactDirectDependencies);
printRangeSection("Range direct dependencies:", rangeDirectDependencies);
printExactVersionSection("Exact peer dependencies:", exactPeerDependencies, {
  includeWorkspace: true,
});
printRangeSection("Range peer dependencies:", rangePeerDependencies);
