#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".next-check",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
]);

const CHECKS = {
  tailwind: {
    description:
      "Avoid Tailwind forced scrollbars. Use overflow-auto, overflow-x-auto, or overflow-y-auto.",
    pattern:
      /(?:^|[\s"'`])(?:[\w-]+:)*!?(overflow(?:-[xy])?-scroll)!?(?=$|[\s"'`])/,
  },
  vitest: {
    description:
      "Vitest in-source testing should only be used while developing, not in committed code.",
    pattern: /(^|[^"'`\\\w])import\.meta\.vitest\b/,
  },
};

function parseArgs(argv) {
  const selectedChecks = {
    tailwind: [],
    vitest: [],
  };
  let currentCheck = null;

  for (const arg of argv) {
    if (arg === "--tailwind") {
      currentCheck = "tailwind";
      continue;
    }
    if (arg === "--vitest") {
      currentCheck = "vitest";
      continue;
    }
    if (!currentCheck) {
      throw new Error(`Expected --tailwind or --vitest before path: ${arg}`);
    }
    selectedChecks[currentCheck].push(arg);
  }

  if (
    selectedChecks.tailwind.length === 0 &&
    selectedChecks.vitest.length === 0
  ) {
    throw new Error(
      "Usage: node scripts/lint/check-oxlint-replacements.mjs --vitest <path...> [--tailwind <path...>]",
    );
  }

  return selectedChecks;
}

function* walkFiles(inputPath) {
  const resolvedPath = path.resolve(inputPath);
  const stats = statSync(resolvedPath);

  if (stats.isFile()) {
    if (EXTENSIONS.has(path.extname(resolvedPath))) {
      yield resolvedPath;
    }
    return;
  }

  if (!stats.isDirectory()) {
    return;
  }

  const entries = readdirSync(resolvedPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    yield* walkFiles(path.join(resolvedPath, entry.name));
  }
}

function scanFiles(checkName, inputPaths) {
  const check = CHECKS[checkName];
  const violations = [];

  for (const inputPath of inputPaths) {
    for (const filePath of walkFiles(inputPath)) {
      const contents = readFileSync(filePath, "utf8");
      const lines = contents.split(/\r?\n/);

      lines.forEach((line, index) => {
        if (check.pattern.test(line)) {
          violations.push({
            checkName,
            description: check.description,
            filePath,
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }
  }

  return violations;
}

try {
  const selectedChecks = parseArgs(process.argv.slice(2));
  const violations = [
    ...scanFiles("vitest", selectedChecks.vitest),
    ...scanFiles("tailwind", selectedChecks.tailwind),
  ];

  if (violations.length > 0) {
    for (const violation of violations) {
      const relativePath = path.relative(process.cwd(), violation.filePath);
      console.error(
        `${relativePath}:${violation.line} ${violation.checkName}: ${violation.description}`,
      );
      console.error(`  ${violation.text}`);
    }
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
