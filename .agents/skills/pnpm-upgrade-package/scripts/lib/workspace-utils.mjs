import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const packageFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

export function formatWorkspaceReference(reference) {
  const label = reference.workspaceName
    ? `${reference.path} (${reference.workspaceName})`
    : reference.path;
  const specs = reference.matches
    .map((match) => `${match.field}: ${match.spec}`)
    .join(", ");

  return `${label} -> ${specs}`;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function stripInlineComment(line) {
  let quote = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quote) {
      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "#") {
      return line.slice(0, index).trimEnd();
    }
  }

  return line;
}

function unquoteYamlScalar(value) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export function readWorkspaceConfig(path) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/);
  let minimumReleaseAge = 0;
  const minimumReleaseAgeExclude = [];
  const overrides = {};
  const patchedDependencies = {};
  let activeBlock = null;

  for (const line of lines) {
    const uncommented = stripInlineComment(line);
    const trimmed = uncommented.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const ageMatch = trimmed.match(/^minimumReleaseAge:\s*(\d+)\s*$/);
    if (ageMatch) {
      minimumReleaseAge = Number(ageMatch[1]);
      activeBlock = null;
      continue;
    }

    if (/^minimumReleaseAgeExclude:\s*$/.test(trimmed)) {
      activeBlock = "minimumReleaseAgeExclude";
      continue;
    }

    if (/^overrides:\s*$/.test(trimmed)) {
      activeBlock = "overrides";
      continue;
    }

    if (/^patchedDependencies:\s*$/.test(trimmed)) {
      activeBlock = "patchedDependencies";
      continue;
    }

    if (/^\S/.test(uncommented)) {
      activeBlock = null;
      continue;
    }

    if (activeBlock === "minimumReleaseAgeExclude") {
      const excludeMatch = uncommented.match(/^\s*-\s+(.+?)\s*$/);
      if (excludeMatch) {
        minimumReleaseAgeExclude.push(unquoteYamlScalar(excludeMatch[1]));
      }
      continue;
    }

    if (activeBlock === "overrides" || activeBlock === "patchedDependencies") {
      const entryMatch = uncommented.match(/^\s+(.+?):\s+(.+?)\s*$/);
      if (!entryMatch) continue;

      const selector = unquoteYamlScalar(entryMatch[1]);
      const value = unquoteYamlScalar(entryMatch[2]);
      if (activeBlock === "overrides") {
        overrides[selector] = value;
      } else {
        patchedDependencies[selector] = value;
      }
    }
  }

  return {
    minimumReleaseAge,
    minimumReleaseAgeExclude,
    overrides,
    patchedDependencies,
  };
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

export function entryCoversVersion(entry, wantedPackage, wantedVersion) {
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
  const workspaceConfig = readWorkspaceConfig(
    join(repoRoot, "pnpm-workspace.yaml"),
  );

  return {
    overrideMatches: Object.entries(workspaceConfig.overrides)
      .filter(([selector]) => matchesPackageSelector(selector, packageName))
      .map(([selector, value]) => ({ selector, value })),
    patchedDependencyMatches: Object.entries(
      workspaceConfig.patchedDependencies,
    )
      .filter(([selector]) => matchesPackageSelector(selector, packageName))
      .map(([selector, value]) => ({ selector, value })),
  };
}
