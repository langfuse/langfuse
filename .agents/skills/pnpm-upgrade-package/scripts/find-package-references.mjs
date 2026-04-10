#!/usr/bin/env node

import { getPackageWorkspaceContext } from "./lib/workspace-utils.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const packageName = args.find((arg) => !arg.startsWith("--"));

if (!packageName) {
  console.error(
    "Usage: node .agents/skills/pnpm-upgrade-package/scripts/find-package-references.mjs <package> [--json]",
  );
  process.exit(1);
}

const result = getPackageWorkspaceContext(process.cwd(), packageName);

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(`Package: ${result.packageName}`);
console.log("");

if (result.locations.length === 0) {
  console.log("No direct workspace references found.");
} else {
  console.log("Direct workspace references:");
  for (const location of result.locations) {
    const label = location.workspaceName
      ? `${location.path} (${location.workspaceName})`
      : location.path;
    console.log(`- ${label}`);
    for (const match of location.matches) {
      console.log(`  ${match.field}: ${match.spec}`);
    }
  }
}

console.log("");
console.log("Root pnpm controls:");
if (
  result.rootPnpm.overrideMatches.length === 0 &&
  result.rootPnpm.patchedDependencyMatches.length === 0
) {
  console.log("- none");
} else {
  for (const match of result.rootPnpm.overrideMatches) {
    console.log(`- override ${match.selector}: ${match.value}`);
  }
  for (const match of result.rootPnpm.patchedDependencyMatches) {
    console.log(`- patched dependency ${match.selector}: ${match.value}`);
  }
}

console.log("");
console.log(
  `minimumReleaseAge: ${result.workspaceConfig.minimumReleaseAge ?? "not set"}`,
);
if (
  result.workspaceConfig.matchingMinimumReleaseAgeExcludeEntries.length === 0
) {
  console.log("Matching minimumReleaseAgeExclude entries: none");
} else {
  console.log("Matching minimumReleaseAgeExclude entries:");
  for (const entry of result.workspaceConfig
    .matchingMinimumReleaseAgeExcludeEntries) {
    console.log(`- ${entry}`);
  }
}
