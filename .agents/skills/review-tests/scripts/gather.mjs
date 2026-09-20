#!/usr/bin/env node
// Static index that scopes `measure`. Deterministic: no model calls, so the
// same diff always yields the same clusters.
//
//   node .agents/skills/review-tests/scripts/gather.mjs [paths...] [flags]
//
//   --base <ref>              diff base (default: merge-base with origin/main)
//   --breadth-threshold <n>   keep symbols called from at most n test files (default 12)
//   --pretty                  indent the JSON
//
// With paths, every test they name seeds the scan. Without paths, the branch
// diff plus uncommitted changes decide the scope. For each production symbol a
// changed test calls, gather emits a hypothesis cluster: the export's line and
// the test blocks that statically reference it. `measure` then stubs the symbol
// and returns the confirmed cluster in the same shape.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  TEST_FILE_RE,
  buildSymbolIndex,
  callSymbols,
} from "./lib/candidates.mjs";
import {
  buildClusters,
  buildReferenceBlocks,
  inHunks,
  parseHunks,
  seedSymbols,
} from "./lib/clusters.mjs";
import { locateExport } from "./lib/measure.mjs";
import { scanTests } from "./lib/scan-tests.mjs";

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 }).trim();

const lines = (text) => (text ? text.split("\n").filter(Boolean) : []);

function parseArgs(argv) {
  const opts = { paths: [], base: null, breadthThreshold: 12, pretty: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") opts.base = argv[++i];
    else if (arg === "--breadth-threshold") {
      opts.breadthThreshold = Number(argv[++i]);
    } else if (arg === "--pretty") opts.pretty = true;
    else if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`);
    else opts.paths.push(arg);
  }
  if (!Number.isInteger(opts.breadthThreshold) || opts.breadthThreshold < 1) {
    throw new Error("--breadth-threshold must be a positive integer");
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
  // Without an explicit pathspec `git diff` would report the whole tree.
  if (files.length === 0) return { files, hunks: new Map() };
  return {
    files,
    hunks: parseHunks(git(["diff", "-U0", base, "--", ...files])),
  };
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

// The breadth of each seed symbol, so the threshold can be tuned against a real
// diff. Diagnostic only; stdout carries the clusters.
function reportBreadth(seeds, index) {
  const counts = new Map();
  for (const sym of seeds) {
    const breadth = index.get(sym)?.size ?? 0;
    counts.set(breadth, (counts.get(breadth) ?? 0) + 1);
  }
  const dist = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([breadth, n]) => `${breadth}:${n}`)
    .join(" ");
  process.stderr.write(
    `seed symbols: ${seeds.length}; breadth:count ${dist || "none"}\n`,
  );
}

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

  // Every test file in the repo is scanned so a symbol's breadth is measured
  // against the whole suite; scanning all of them costs well under a second.
  const allTestFiles = allFiles.filter((f) => TEST_FILE_RE.test(f));
  const testsByFile = new Map();
  const byTestId = new Map();
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
    for (const t of scanned.tests) {
      byTestId.set(t.id, {
        file,
        test: t,
        symbols: callSymbols(t.source, scanned.bindings, file, exists),
      });
    }
  }

  const index = buildSymbolIndex(byTestId);
  const blocks = buildReferenceBlocks(byTestId);

  // Seed from the changed tests' called symbols, scoped to changed line ranges
  // so an untouched test in an edited file does not seed the scan.
  const targetEntries = [];
  for (const file of targetFiles) {
    for (const t of testsByFile.get(file) ?? []) {
      if (!inHunks(t, hunks.get(file))) continue;
      const entry = byTestId.get(t.id);
      if (entry) targetEntries.push(entry);
    }
  }
  const seeds = seedSymbols(targetEntries);
  reportBreadth(seeds, index);

  const clusters = buildClusters({
    seeds,
    index,
    blocks,
    threshold: opts.breadthThreshold,
    readSource: readIfPresent,
    locate: locateExport,
  });

  const result = {
    mode: sweep ? "sweep" : "diff",
    base,
    baseKind,
    breadthThreshold: opts.breadthThreshold,
    clusters,
    unscannable,
    truncated: null,
  };

  process.stdout.write(JSON.stringify(result, null, opts.pretty ? 2 : 0));
}

main();
