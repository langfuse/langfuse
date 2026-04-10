import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const packageFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readWorkspaceConfig(path) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/);
  let minimumReleaseAge = 0;
  const minimumReleaseAgeExclude = [];
  let inExcludeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const ageMatch = trimmed.match(/^minimumReleaseAge:\s*(\d+)\s*$/);
    if (ageMatch) {
      minimumReleaseAge = Number(ageMatch[1]);
      continue;
    }

    if (/^minimumReleaseAgeExclude:\s*$/.test(trimmed)) {
      inExcludeBlock = true;
      continue;
    }

    if (inExcludeBlock) {
      const excludeMatch = line.match(/^\s*-\s+(.+?)\s*$/);
      if (excludeMatch) {
        minimumReleaseAgeExclude.push(
          excludeMatch[1].replace(/^['"]|['"]$/g, ""),
        );
        continue;
      }

      if (/^\S/.test(line)) {
        inExcludeBlock = false;
      }
    }
  }

  return { minimumReleaseAge, minimumReleaseAgeExclude };
}

export function collectPackageJsonPaths(repoRoot) {
  const paths = [
    "package.json",
    "web/package.json",
    "worker/package.json",
    "ee/package.json",
  ];
  const packagesRoot = join(repoRoot, "packages");

  if (!existsSync(packagesRoot)) return paths;

  const stack = [packagesRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".git"
      ) {
        continue;
      }

      const nextPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }

      if (entry.isFile() && entry.name === "package.json") {
        paths.push(relative(repoRoot, nextPath));
      }
    }
  }

  return [...new Set(paths)];
}

export function matchesPackageSelector(selector, wantedPackage) {
  if (selector === wantedPackage) return true;
  if (selector.startsWith(`${wantedPackage}@`)) return true;
  if (selector.endsWith(`>${wantedPackage}`)) return true;
  if (selector.includes(`>${wantedPackage}@`)) return true;
  if (selector.endsWith("/*")) {
    const prefix = selector.slice(0, -1);
    return wantedPackage.startsWith(prefix);
  }
  return false;
}

export function findLocalPackageReferences(repoRoot, wantedPackage) {
  const results = [];

  for (const packageJsonPath of collectPackageJsonPaths(repoRoot)) {
    const json = readJson(join(repoRoot, packageJsonPath));
    const matches = [];

    for (const field of packageFields) {
      if (json[field]?.[wantedPackage]) {
        matches.push({ field, spec: json[field][wantedPackage] });
      }
    }

    if (matches.length > 0) {
      results.push({
        path: packageJsonPath,
        workspaceName: json.name ?? null,
        matches,
      });
    }
  }

  return results;
}

export function getRootPnpmControls(repoRoot, packageName) {
  const rootPackageJson = readJson(join(repoRoot, "package.json"));

  return {
    overrideMatches: Object.entries(rootPackageJson.pnpm?.overrides ?? {})
      .filter(([selector]) => matchesPackageSelector(selector, packageName))
      .map(([selector, value]) => ({ selector, value })),
    patchedDependencyMatches: Object.entries(
      rootPackageJson.pnpm?.patchedDependencies ?? {},
    )
      .filter(([selector]) => matchesPackageSelector(selector, packageName))
      .map(([selector, value]) => ({ selector, value })),
  };
}

export function getPackageWorkspaceContext(repoRoot, packageName) {
  const workspaceConfig = readWorkspaceConfig(join(repoRoot, "pnpm-workspace.yaml"));

  return {
    packageName,
    locations: findLocalPackageReferences(repoRoot, packageName),
    rootPnpm: getRootPnpmControls(repoRoot, packageName),
    workspaceConfig: {
      minimumReleaseAge: workspaceConfig.minimumReleaseAge,
      matchingMinimumReleaseAgeExcludeEntries:
        workspaceConfig.minimumReleaseAgeExclude.filter((entry) =>
          matchesPackageSelector(entry, packageName),
        ),
    },
  };
}
