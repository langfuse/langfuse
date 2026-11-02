#!/usr/bin/env node

import { join } from "node:path";
import {
  entryCoversVersion,
  findLocalPackageReferences,
  formatWorkspaceReference,
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
const workspaceConfig = readWorkspaceConfig(join(repoRoot, "pnpm-workspace.yaml"));
const minimumReleaseAgeMinutes = workspaceConfig.minimumReleaseAge ?? 0;
const thresholdMs = Date.now() - minimumReleaseAgeMinutes * 60 * 1000;
const REGISTRY_FETCH_TIMEOUT_MS = 30_000;
const registryCache = new Map();
const workspaceReferenceCache = new Map();

const getWorkspaceReferences = (name) => {
  if (!workspaceReferenceCache.has(name)) {
    workspaceReferenceCache.set(name, findLocalPackageReferences(repoRoot, name));
  }

  return workspaceReferenceCache.get(name);
};

function printSectionHeader(title) {
  console.log("");
  console.log(title);
}

function isPrerelease(version) {
  return version.includes("-");
}

function isExactVersion(spec) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(spec.trim());
}

function getMatchingExcludeEntries(name, version) {
  return workspaceConfig.minimumReleaseAgeExclude.filter((entry) =>
    entryCoversVersion(entry, name, version),
  );
}

async function fetchRegistryPackage(name) {
  if (registryCache.has(name)) return registryCache.get(name);

  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    REGISTRY_FETCH_TIMEOUT_MS,
  );
  timeoutId.unref?.();

  try {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(name)}`,
      {
        headers: {
          accept: "application/json",
          "user-agent": "langfuse-pnpm-upgrade-package-skill",
        },
        signal: abortController.signal,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${name} from npm registry: ${response.status}`,
      );
    }

    const metadata = await response.json();
    registryCache.set(name, metadata);
    return metadata;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Timed out fetching ${name} from npm registry after ${REGISTRY_FETCH_TIMEOUT_MS}ms`,
        { cause: error },
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getInstallability(metadata, name, version) {
  const publishedAt = metadata.time?.[version] ?? null;
  const publishedAtMs = publishedAt ? Date.parse(publishedAt) : null;
  const matchingExcludeEntries = getMatchingExcludeEntries(name, version);
  const isYoungerThanMinimumReleaseAge =
    publishedAtMs != null ? publishedAtMs > thresholdMs : null;
  const isInstallableWithoutNewExclude =
    isYoungerThanMinimumReleaseAge == null
      ? null
      : !isYoungerThanMinimumReleaseAge || matchingExcludeEntries.length > 0;

  return {
    name,
    version,
    publishedAt,
    isYoungerThanMinimumReleaseAge,
    isInstallableWithoutNewExclude,
    matchingExcludeEntries,
    suggestedExclude:
      isInstallableWithoutNewExclude === false ? `${name}@${version}` : null,
  };
}

function selectLatestInstallableVersion(metadata, name) {
  const times = metadata.time ?? {};

  return (
    Object.keys(metadata.versions ?? {})
      .filter((version) => times[version] && !isPrerelease(version))
      .sort((left, right) => Date.parse(times[right]) - Date.parse(times[left]))
      .map((version) => getInstallability(metadata, name, version))
      .find((candidate) => candidate.isInstallableWithoutNewExclude) ?? null
  );
}

function collectManifestEntries(manifest, fields) {
  const merged = new Map();

  for (const field of fields) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      const key = `${name}:${spec}`;
      const entry = merged.get(key);

      if (entry) {
        entry.fields.push(field);
        continue;
      }

      merged.set(key, { name, spec, fields: [field] });
    }
  }

  return [...merged.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function analyzeManifestEntries(entries, { includeWorkspace = false } = {}) {
  const exact = [];
  const range = [];

  for (const entry of entries) {
    const workspaceReferences = includeWorkspace
      ? getWorkspaceReferences(entry.name)
      : null;

    if (!isExactVersion(entry.spec)) {
      range.push({
        ...entry,
        ...(includeWorkspace ? { workspaceReferences } : {}),
      });
      continue;
    }

    const metadata = await fetchRegistryPackage(entry.name);
    const installability = getInstallability(metadata, entry.name, entry.spec);

    exact.push({
      ...entry,
      ...installability,
      ...(includeWorkspace
        ? {
            workspaceReferences,
            isInstalledInWorkspace: workspaceReferences.length > 0,
          }
        : {}),
      suggestedExclude:
        includeWorkspace && workspaceReferences.length === 0
          ? null
          : installability.suggestedExclude,
    });
  }

  return { exact, range };
}

function printWorkspaceReferences(title, references) {
  printSectionHeader(title);
  if (references.length === 0) {
    console.log("- none");
    return;
  }

  for (const reference of references) {
    console.log(`- ${formatWorkspaceReference(reference)}`);
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

function printVersionEntries(title, entries, { includeWorkspace = false } = {}) {
  printSectionHeader(title);
  if (entries.length === 0) {
    console.log("- none");
    return;
  }

  for (const entry of entries) {
    const status =
      entry.isInstallableWithoutNewExclude == null
        ? "unknown"
        : entry.isInstallableWithoutNewExclude
          ? "installable now"
          : "needs exclude";

    console.log(
      `- ${entry.name}@${entry.version} (${status}; via ${entry.fields.join(", ")})`,
    );
    if (entry.publishedAt) {
      console.log(`  published at: ${entry.publishedAt}`);
    }
    if (includeWorkspace) {
      console.log(
        `  installed in workspace: ${entry.isInstalledInWorkspace ? "yes" : "no"}`,
      );
      for (const reference of entry.workspaceReferences) {
        console.log(`  workspace reference: ${formatWorkspaceReference(reference)}`);
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

function printRangeEntries(title, entries) {
  printSectionHeader(title);
  if (entries.length === 0) {
    console.log("- none");
    return;
  }

  for (const entry of entries) {
    console.log(
      `- ${entry.name}: ${entry.spec} (manual review; via ${entry.fields.join(", ")})`,
    );
    for (const reference of entry.workspaceReferences ?? []) {
      console.log(`  workspace reference: ${formatWorkspaceReference(reference)}`);
    }
  }
}

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

const packageWorkspaceReferences = getWorkspaceReferences(packageName);
const rootPnpm = getRootPnpmControls(repoRoot, packageName);
const latestInstallableWithoutNewExclude = selectLatestInstallableVersion(
  packageMetadata,
  packageName,
);
const targetInstallability = getInstallability(
  packageMetadata,
  packageName,
  targetVersion,
);
const targetManifest = packageMetadata.versions[targetVersion];

const dependencyCompanions = await analyzeManifestEntries(
  collectManifestEntries(targetManifest, [
    "dependencies",
    "optionalDependencies",
  ]),
);
const peerDependencies = await analyzeManifestEntries(
  collectManifestEntries(targetManifest, ["peerDependencies"]),
  { includeWorkspace: true },
);

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
  targetPublishedAt: targetInstallability.publishedAt,
  targetIsYoungerThanMinimumReleaseAge:
    targetInstallability.isYoungerThanMinimumReleaseAge,
  targetIsInstallableWithoutNewExclude:
    targetInstallability.isInstallableWithoutNewExclude,
  matchingPackageExcludeEntries: targetInstallability.matchingExcludeEntries,
  suggestedPackageExclude: targetInstallability.suggestedExclude,
  exactDependencyCompanions: dependencyCompanions.exact,
  rangeDependencyCompanions: dependencyCompanions.range,
  exactPeerDependencies: peerDependencies.exact,
  rangePeerDependencies: peerDependencies.range,
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
console.log(`Target published at: ${result.targetPublishedAt ?? "unknown"}`);
console.log(
  `Target installable without new exclude: ${
    result.targetIsInstallableWithoutNewExclude == null
      ? "unknown"
      : result.targetIsInstallableWithoutNewExclude
        ? "yes"
        : "no"
  }`,
);
if (result.matchingPackageExcludeEntries.length > 0) {
  console.log("Matching package exclude entries:");
  for (const entry of result.matchingPackageExcludeEntries) {
    console.log(`- ${entry}`);
  }
} else {
  console.log("Matching package exclude entries: none");
}
if (result.suggestedPackageExclude) {
  console.log(`Suggested package exclude: ${result.suggestedPackageExclude}`);
}

printVersionEntries(
  "Exact dependency companions (dependencies + optionalDependencies):",
  result.exactDependencyCompanions,
);
printRangeEntries(
  "Range dependency companions (dependencies + optionalDependencies):",
  result.rangeDependencyCompanions,
);
printVersionEntries("Exact peer dependencies:", result.exactPeerDependencies, {
  includeWorkspace: true,
});
printRangeEntries("Range peer dependencies:", result.rangePeerDependencies);
