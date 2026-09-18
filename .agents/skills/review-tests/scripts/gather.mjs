#!/usr/bin/env node
// Builds the evidence the judges review. Deterministic: no model calls here, so
// the same diff always yields the same prompts.
//
//   node .agents/skills/review-tests/scripts/gather.mjs [paths...] [flags]
//
//   --base <ref>          diff base (default: merge-base with origin/main)
//   --coverage-map <file> test-file -> covered production lines
//   --candidates <n>      candidates per test (default 5)
//   --max-tests <n>       cap the reviewed set (default 60, 0 disables)
//   --pretty              indent the JSON
//
// With paths, every test they name is reviewed. Without paths, the branch diff
// plus uncommitted changes decide the scope. Emits the evidence object contract
// documented in SKILL.md on stdout.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  TEST_FILE_RE,
  productionTargets,
  rankFiles,
  selectCandidates,
} from "./lib/candidates.mjs";
import { scanTests } from "./lib/scan-tests.mjs";

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 }).trim();

const lines = (text) => (text ? text.split("\n").filter(Boolean) : []);

function parseArgs(argv) {
  const opts = {
    paths: [],
    base: null,
    coverageMap: null,
    candidates: 5,
    maxTests: 60,
    pretty: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") opts.base = argv[++i];
    else if (arg === "--coverage-map") opts.coverageMap = argv[++i];
    else if (arg === "--candidates") opts.candidates = Number(argv[++i]);
    else if (arg === "--max-tests") opts.maxTests = Number(argv[++i]);
    else if (arg === "--pretty") opts.pretty = true;
    else if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`);
    else opts.paths.push(arg);
  }
  if (!Number.isInteger(opts.candidates) || opts.candidates < 1) {
    throw new Error("--candidates must be a positive integer");
  }
  if (!Number.isInteger(opts.maxTests) || opts.maxTests < 0) {
    throw new Error("--max-tests must be a non-negative integer");
  }
  return opts;
}

// A shallow clone often shares no ancestor with origin/main, so fall back to
// the branch tip and finally to HEAD (uncommitted changes only) rather than
// refusing to run. The chosen base is reported so a narrow scope is visible.
function resolveBase(explicit) {
  if (explicit) return { base: explicit, baseKind: "explicit" };
  for (const ref of ["origin/main", "main"]) {
    try {
      const found = git(["merge-base", "HEAD", ref]);
      if (found) return { base: found, baseKind: `merge-base with ${ref}` };
    } catch {
      /* try the next ref */
    }
  }
  for (const ref of ["origin/main", "main"]) {
    try {
      const found = git(["rev-parse", "--verify", ref]);
      if (found)
        return {
          base: found,
          baseKind: `${ref} tip (no common ancestor found)`,
        };
    } catch {
      /* try the next ref */
    }
  }
  return { base: "HEAD", baseKind: "HEAD (uncommitted changes only)" };
}

/** Changed test files, plus the changed line ranges that scope which tests count. */
function changedTestFiles(base) {
  const changed = [
    ...lines(git(["diff", "--name-only", "--diff-filter=AM", base])),
    ...lines(git(["diff", "--name-only", "--diff-filter=AM"])),
    ...lines(git(["ls-files", "--others", "--exclude-standard"])),
  ].filter((f) => TEST_FILE_RE.test(f));

  const files = [...new Set(changed)];
  const hunks = new Map();
  // Without an explicit pathspec `git diff` would report the whole tree.
  if (files.length === 0) return { files, hunks };
  const diff = git(["diff", "-U0", base, "--", ...files]);
  let current = null;
  for (const line of diff.split("\n")) {
    const file = /^\+\+\+ b\/(.+)$/.exec(line);
    if (file) {
      current = file[1];
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))?/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count === 0) continue; // pure deletion
      if (!hunks.has(current)) hunks.set(current, []);
      hunks.get(current).push([start, start + count - 1]);
    }
  }
  return { files, hunks };
}

function expandPaths(paths, allFiles) {
  const out = [];
  for (const path of paths) {
    if (TEST_FILE_RE.test(path)) {
      out.push(path);
      continue;
    }
    const prefix = path.endsWith("/") ? path : `${path}/`;
    out.push(
      ...allFiles.filter((f) => f.startsWith(prefix) && TEST_FILE_RE.test(f)),
    );
  }
  return [...new Set(out)];
}

const readIfPresent = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const allFiles = lines(git(["ls-files"]));
  const repoFiles = new Set(allFiles);
  const exists = (p) => repoFiles.has(p);

  const sweep = opts.paths.length > 0;
  const { base, baseKind } = sweep
    ? { base: null, baseKind: null }
    : resolveBase(opts.base);
  const scope = sweep
    ? expandPaths(opts.paths, allFiles)
    : changedTestFiles(base);
  const targetFiles = sweep ? scope : scope.files;
  const hunks = sweep ? new Map() : scope.hunks;

  const coverage = opts.coverageMap
    ? (JSON.parse(readIfPresent(opts.coverageMap) ?? "null")?.tests ?? null)
    : null;

  // Every test file in the repo is scanned: candidates may live anywhere, and
  // scanning all of them costs well under a second.
  const allTestFiles = allFiles.filter((f) => TEST_FILE_RE.test(f));
  const testsByFile = new Map();
  const testToModules = new Map();
  const unscannable = [];
  for (const file of allTestFiles) {
    const src = readIfPresent(file);
    if (src === null) continue;
    let scanned;
    try {
      scanned = scanTests(src, file);
    } catch (error) {
      unscannable.push({ file, reason: error.message });
      continue;
    }
    if (scanned.tests.length === 0 && targetFiles.includes(file)) {
      unscannable.push({ file, reason: "no describe/it blocks found" });
    }
    testsByFile.set(file, scanned.tests);
    testToModules.set(file, productionTargets(scanned.imports, file, exists));
  }

  const inHunks = (test, ranges) =>
    !ranges || ranges.some(([lo, hi]) => test.endLine >= lo && test.line <= hi);

  const tests = [];
  for (const file of targetFiles) {
    const ranked = rankFiles({ targetFile: file, testToModules, coverage });
    for (const target of testsByFile.get(file) ?? []) {
      if (!inHunks(target, hunks.get(file))) continue;
      tests.push({
        id: target.id,
        file: target.file,
        name: target.name,
        line: target.line,
        endLine: target.endLine,
        parameterized: target.parameterized,
        source: target.source,
        assertions: target.assertions,
        coveredLines: coverage?.[file] ?? null,
        imports: testToModules.get(file) ?? [],
        candidates: selectCandidates({
          target,
          testsByFile,
          ranked,
          limit: opts.candidates,
        }),
      });
    }
  }

  // One judge runs per reviewed test per rule, so an accidentally huge scope is
  // reported rather than silently spent.
  const kept = opts.maxTests === 0 ? tests : tests.slice(0, opts.maxTests);
  const truncated =
    kept.length < tests.length
      ? {
          reviewed: kept.length,
          dropped: tests.length - kept.length,
          reason: `--max-tests ${opts.maxTests}; narrow the scope or raise the cap`,
        }
      : null;

  const evidence = {
    mode: sweep ? "sweep" : "diff",
    base,
    baseKind,
    degraded: !coverage,
    degradedReason: coverage
      ? null
      : "no coverage map; candidates ranked by shared production imports",
    files: targetFiles,
    testCount: kept.length,
    discoveredTestCount: tests.length,
    suiteTestFileCount: allTestFiles.length,
    truncated,
    unscannable,
    tests: kept,
  };

  process.stdout.write(JSON.stringify(evidence, null, opts.pretty ? 2 : 0));
}

main();
