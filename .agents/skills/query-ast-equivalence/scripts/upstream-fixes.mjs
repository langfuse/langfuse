#!/usr/bin/env node
// List commits on the target branch that touched the legacy implementation a
// migration replaces, so each can be checked for survival in the migrated code.
//
//   node upstream-fixes.mjs [--base <ref>] [--head <ref>] [--target <ref>]
//                           [--since <date>] [--all-imports]
//
// Scope: every non-test .ts file the branch changes, plus every relative
// query-layer module those files imported at the base (e.g.
// event-query-builder.ts) — a fix in an imported builder map is lost when the
// migration copied from it. --all-imports widens that to every relative import.
// Window: since the author date of the branch's oldest commit, not since the
// merge-base, because a rebase moves the merge-base past fixes the copied code
// never received. Override with --since (e.g. when replaying a squash merge).

import { execFileSync } from "node:child_process";
import { dirname, join, normalize } from "node:path";

const git = (args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 << 20,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

const QUERY_LAYER =
  /\/(repositories|queries|query-ast|clickhouse-sql)\/|(query|builder|filter|clickhouse|sql|tableDefinitions)[^/]*\.ts$/i;

const args = { head: "HEAD", target: "origin/main", allImports: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--base") args.base = process.argv[++i];
  else if (a === "--head") args.head = process.argv[++i];
  else if (a === "--target") args.target = process.argv[++i];
  else if (a === "--since") args.since = process.argv[++i];
  else if (a === "--all-imports") args.allImports = true;
}
const base = args.base ?? git(["merge-base", args.head, args.target]);

const exists = (ref, path) => {
  try {
    git(["cat-file", "-e", `${ref}:${path}`]);
    return true;
  } catch {
    return false;
  }
};

function resolveImport(from, spec) {
  const raw = normalize(join(dirname(from), spec)).replace(/\.js$/, "");
  return [`${raw}.ts`, `${raw}/index.ts`].find((p) => exists(base, p));
}

const changed = git(["diff", "--name-only", base, args.head, "--", "*.ts"])
  .split("\n")
  .filter((p) => p && !/\.test\.ts$|__snapshots__|\.assert\.ts$/.test(p));

const scope = new Map(); // path -> why it is in scope
for (const file of changed) {
  scope.set(file, "changed on branch");
  if (!exists(base, file)) continue;
  const src = git(["show", `${base}:${file}`]);
  for (const m of src.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    const dep = resolveImport(file, m[1]);
    if (!dep || scope.has(dep)) continue;
    if (args.allImports || QUERY_LAYER.test(dep)) {
      scope.set(dep, `imported by ${file} at base`);
    }
  }
}

const oldest = git([
  "log",
  "--reverse",
  "--format=%aI",
  `${base}..${args.head}`,
]).split("\n")[0];
const since =
  args.since ?? (oldest || git(["log", "-1", "--format=%aI", base]));
const branchCommits = new Set(
  git(["log", "--format=%H", `${base}..${args.head}`])
    .split("\n")
    .filter(Boolean),
);

console.log(
  `base ${base.slice(0, 10)}  head ${args.head}  target ${args.target}  since ${since}`,
);
console.log(
  `scope: ${scope.size} files (${changed.length} changed + query-layer imports at base)\n`,
);

let hits = 0;
for (const [path, why] of scope) {
  const log = git([
    "log",
    "--since",
    since,
    "--format=%H%x09%ad%x09%s",
    "--date=short",
    args.target,
    "--",
    path,
  ])
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"))
    .filter(([sha]) => !branchCommits.has(sha));
  if (!log.length) continue;
  console.log(`${path}  (${why})`);
  for (const [sha, date, subject] of log) {
    let inHead = true;
    try {
      git(["merge-base", "--is-ancestor", sha, args.head]);
    } catch {
      inHead = false;
    }
    console.log(
      `  ${sha.slice(0, 10)} ${date} ${inHead ? "[in head history]" : "[NOT in head]    "} ${subject}`,
    );
    hits++;
  }
  console.log("");
}
if (!hits) console.log("No upstream commits touched the scope in the window.");
