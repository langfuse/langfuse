#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const VERSION_TS_PATTERN = /^export const VERSION = "v([^"]+)";\s*$/;

export const JSON_VERSION_FILES = [
  "package.json",
  "web/package.json",
  "worker/package.json",
];

export const TS_VERSION_FILES = [
  "packages/shared/src/constants/VERSION.ts",
  "web/src/constants/VERSION.ts",
  "worker/src/constants/VERSION.ts",
];

export const ALL_VERSION_FILES = [...JSON_VERSION_FILES, ...TS_VERSION_FILES];

export function stripLeadingV(raw) {
  return raw.trim().replace(/^v/, "");
}

export function parseSemver(raw) {
  const cleaned = stripLeadingV(raw);
  const match = SEMVER_PATTERN.exec(cleaned);
  if (!match) {
    throw new Error(
      `Invalid semantic version "${raw}". Expected X.Y.Z or X.Y.Z-prerelease.`,
    );
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prerelease = match[4] ? match[4].split(".") : [];

  for (const id of prerelease) {
    if (!id) {
      throw new Error(`Invalid prerelease identifier in "${raw}".`);
    }
    if (/^\d+$/.test(id) && id.length > 1 && id.startsWith("0")) {
      throw new Error(
        `Numeric prerelease identifier "${id}" in "${raw}" must not have leading zeros.`,
      );
    }
  }

  return {
    raw: cleaned,
    major,
    minor,
    patch,
    prerelease,
  };
}

export function compareSemver(aRaw, bRaw) {
  const a = typeof aRaw === "string" ? parseSemver(aRaw) : aRaw;
  const b = typeof bRaw === "string" ? parseSemver(bRaw) : bRaw;

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i += 1) {
    const ai = a.prerelease[i];
    const bi = b.prerelease[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    if (ai === bi) continue;

    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);
    if (aNum && bNum) return Number(ai) - Number(bi);
    if (aNum) return -1;
    if (bNum) return 1;
    return ai < bi ? -1 : 1;
  }

  return 0;
}

export function computeNextVersion(currentRaw, bump, customVersion = "") {
  const current = parseSemver(currentRaw);

  let next;
  switch (bump) {
    case "patch":
      next = parseSemver(
        current.prerelease.length > 0
          ? `${current.major}.${current.minor}.${current.patch}`
          : `${current.major}.${current.minor}.${current.patch + 1}`,
      );
      break;
    case "minor":
      next = parseSemver(`${current.major}.${current.minor + 1}.0`);
      break;
    case "major":
      next = parseSemver(`${current.major + 1}.0.0`);
      break;
    case "custom":
      if (!customVersion || !customVersion.trim()) {
        throw new Error("custom_version is required when bump is 'custom'.");
      }
      next = parseSemver(customVersion);
      break;
    default:
      throw new Error(
        `Unsupported bump type "${bump}". Expected patch, minor, major, or custom.`,
      );
  }

  if (compareSemver(next, current) <= 0) {
    throw new Error(
      `Next version "${next.raw}" must be strictly greater than current version "${current.raw}".`,
    );
  }

  return {
    currentVersion: current.raw,
    nextVersion: next.raw,
    tagName: `v${next.raw}`,
    isMajorBump: next.major > current.major,
    isPrerelease: next.prerelease.length > 0,
  };
}

function readJsonVersion(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (typeof parsed.version !== "string") {
    throw new Error(`Missing string "version" field in ${filePath}.`);
  }
  return parseSemver(parsed.version).raw;
}

function readTsVersion(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const match = VERSION_TS_PATTERN.exec(content);
  if (!match) {
    throw new Error(`Unexpected VERSION.ts format in ${filePath}.`);
  }
  return parseSemver(match[1]).raw;
}

export function readRepoVersion(rootDir) {
  const versions = new Map();
  for (const rel of JSON_VERSION_FILES) {
    versions.set(rel, readJsonVersion(path.join(rootDir, rel)));
  }
  for (const rel of TS_VERSION_FILES) {
    versions.set(rel, readTsVersion(path.join(rootDir, rel)));
  }

  const unique = new Set(versions.values());
  if (unique.size !== 1) {
    const details = [...versions.entries()]
      .map(([file, ver]) => `${file}=${ver}`)
      .join(", ");
    throw new Error(
      `Version mismatch across tracked release files: ${details}`,
    );
  }

  return [...unique][0];
}

export function bumpReleaseVersion({
  rootDir,
  bump,
  customVersion = "",
  dryRun = false,
}) {
  const currentVersion = readRepoVersion(rootDir);
  const computed = computeNextVersion(currentVersion, bump, customVersion);

  if (!dryRun) {
    for (const rel of JSON_VERSION_FILES) {
      const fullPath = path.join(rootDir, rel);
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      parsed.version = computed.nextVersion;
      fs.writeFileSync(
        fullPath,
        `${JSON.stringify(parsed, null, 2)}\n`,
        "utf8",
      );
    }

    for (const rel of TS_VERSION_FILES) {
      const fullPath = path.join(rootDir, rel);
      fs.writeFileSync(
        fullPath,
        `export const VERSION = "${computed.tagName}";\n`,
        "utf8",
      );
    }
  }

  return {
    ...computed,
    dryRun,
    files: ALL_VERSION_FILES,
  };
}

function parseArgs(argv) {
  const opts = {
    rootDir: process.cwd(),
    bump: "",
    customVersion: "",
    dryRun: false,
    json: false,
    readOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--root":
        opts.rootDir = path.resolve(argv[++i] ?? "");
        break;
      case "--bump":
        opts.bump = argv[++i] ?? "";
        break;
      case "--custom-version":
        opts.customVersion = argv[++i] ?? "";
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--print-current":
        opts.readOnly = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.readOnly) {
    const currentVersion = readRepoVersion(opts.rootDir);
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ currentVersion })}\n`);
    } else {
      process.stdout.write(`${currentVersion}\n`);
    }
    return;
  }

  if (!opts.bump) {
    throw new Error("Missing required --bump <patch|minor|major|custom> flag.");
  }

  const result = bumpReleaseVersion(opts);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    const mode = result.dryRun ? " (dry-run)" : "";
    process.stdout.write(
      `Bumped release version ${result.currentVersion} -> ${result.nextVersion}${mode}\n`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (err) {
    process.stderr.write(
      `ERROR: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
