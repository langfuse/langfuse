#!/usr/bin/env node
// Render the branch's golden SQL cases on two commits with one `clickhouse`
// binary, then classify every per-case difference.
//
//   node golden-equivalence.mjs [--base <ref>] [--head <ref>] [--out <dir>]
//                               [--overlay <path>]... [--keep] [test-file...]
//
// Both sides run in throwaway detached worktrees that borrow this checkout's
// node_modules. The head's golden test files and goldenHarness.ts are copied
// onto both sides, so the only variable is the implementation under test.
// Exit code: 0 when every case is identical or bind-only, 1 otherwise.

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS = "packages/shared/src/server/repositories/goldenHarness.ts";
const SHARED = "packages/shared";

const git = (args, opts = {}) =>
  execFileSync("git", args, { encoding: "utf8", ...opts }).trim();

function parseArgs(argv) {
  const args = { overlay: [], tests: [], keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--overlay") args.overlay.push(argv[++i]);
    else if (a === "--keep") args.keep = true;
    else if (a === "-h" || a === "--help") {
      console.log(
        readFileSync(fileURLToPath(import.meta.url), "utf8")
          .split("\n")
          .slice(1, 12)
          .join("\n"),
      );
      process.exit(0);
    } else args.tests.push(a);
  }
  return args;
}

function ciPin(repo) {
  const yml = readFileSync(
    join(repo, ".github/workflows/pipeline.yml"),
    "utf8",
  );
  return /CLICKHOUSE_VERSION:\s*"?([\d.]+)/.exec(yml)?.[1];
}

function chVersion(bin) {
  const res = spawnSync(bin, ["--version"], { encoding: "utf8" });
  return /version\s+([\d.]+)/i.exec(res.stdout ?? "")?.[1];
}

// Explicit CLICKHOUSE_BIN wins even when off-pin; otherwise prefer a local
// binary at the CI pin, then the Docker wrapper, then whatever is on PATH.
function pickClickhouse(pin) {
  const explicit = process.env.CLICKHOUSE_BIN;
  if (explicit) return { bin: explicit, version: chVersion(explicit) };
  const wrapper = join(
    dirname(fileURLToPath(import.meta.url)),
    "clickhouse-ci.sh",
  );
  for (const bin of ["clickhouse", wrapper]) {
    const version = chVersion(bin);
    if (version && version === pin) return { bin, version };
  }
  return { bin: "clickhouse", version: chVersion("clickhouse") };
}

function defaultTests(repo, base, head) {
  const changed = git(
    [
      "diff",
      "--name-only",
      base,
      head,
      "--",
      "*.golden.test.ts",
      "*.golden.test.ts.snap",
    ],
    { cwd: repo },
  )
    .split("\n")
    .filter(Boolean)
    .map((p) => p.replace(/\/__snapshots__\/([^/]+)\.snap$/, "/$1"));
  return [...new Set(changed)].filter((p) => {
    try {
      git(["cat-file", "-e", `${head}:${p}`], { cwd: repo });
      return true;
    } catch {
      return false;
    }
  });
}

const snapPath = (root, test) =>
  join(root, dirname(test), "__snapshots__", `${basename(test)}.snap`);

function renderSide({ repo, ref, head, tests, overlay, bin, workdir, label }) {
  const wt = join(workdir, `wt-${label}`);
  git(["worktree", "add", "--detach", "--quiet", wt, ref], { cwd: repo });
  for (const nm of ["node_modules", `${SHARED}/node_modules`]) {
    if (!existsSync(join(repo, nm))) {
      throw new Error(`${nm} missing in ${repo}; run pnpm install there first`);
    }
    rmSync(join(wt, nm), { recursive: true, force: true });
    symlinkSync(join(repo, nm), join(wt, nm));
  }
  const env = existsSync(join(repo, ".env")) ? ".env" : ".env.dev.example";
  copyFileSync(join(repo, env), join(wt, ".env"));

  for (const path of [...tests, HARNESS, ...overlay]) {
    mkdirSync(dirname(join(wt, path)), { recursive: true });
    writeFileSync(
      join(wt, path),
      git(["show", `${head}:${path}`], { cwd: repo, maxBuffer: 64 << 20 }) +
        "\n",
    );
  }
  for (const t of tests) rmSync(snapPath(wt, t), { force: true });

  const res = spawnSync(
    "pnpm",
    // The worktree borrows node_modules via symlink; pnpm's pre-run install
    // check would try to rebuild it in place.
    [
      "--config.verify-deps-before-run=false",
      "run",
      "test",
      ...tests.map((t) => relative(SHARED, t)),
      "-u",
    ],
    {
      cwd: join(wt, SHARED),
      encoding: "utf8",
      env: { ...process.env, CLICKHOUSE_BIN: bin, FORCE_COLOR: "0" },
      maxBuffer: 256 << 20,
    },
  );
  const log = join(workdir, `${label}.log`);
  writeFileSync(log, `${res.stdout ?? ""}\n${res.stderr ?? ""}`);

  const cases = new Map();
  for (const t of tests) {
    const file = snapPath(wt, t);
    if (!existsSync(file)) continue;
    const exportsObj = {};
    new Function("exports", readFileSync(file, "utf8"))(exportsObj);
    for (const [key, value] of Object.entries(exportsObj))
      cases.set(`${t} :: ${key}`, value);
  }
  return { wt, log, status: res.status, cases };
}

const SQL_BLOCK = /"sql": "((?:[^"\\]|\\.)*)"/g;
const sqlBlocks = (s) => [...s.matchAll(SQL_BLOCK)].map((m) => m[1]);
const nonSql = (s) => s.replace(SQL_BLOCK, '"sql": <sql>');
const maskBinds = (s) =>
  s
    .replace(/\{param\d+:[^}]+\}/g, "?")
    .replace(/\\'(?:[^'\\]|\\.)*?\\'|'(?:[^'\\]|\\.)*'/g, "?")
    .replace(/\b\d+(?:\.\d+)?\b/g, "?");
const sortedLines = (s) =>
  s
    .split("\\n")
    .map((l) => l.trim())
    .sort()
    .join("\n");

const RANK = {
  identical: 0,
  bind: 1,
  "params/tags": 2,
  reorder: 3,
  semantic: 4,
};

function classify(base, head) {
  if (base === undefined) return "missing-on-base";
  if (head === undefined) return "missing-on-head";
  if (base === head) return "identical";
  const a = sqlBlocks(base);
  const b = sqlBlocks(head);
  if (a.length !== b.length) return "semantic";
  let worst = "identical";
  const bump = (c) => {
    if (RANK[c] > RANK[worst]) worst = c;
  };
  a.forEach((x, i) => {
    const y = b[i];
    if (x === y) return;
    if (sortedLines(x) === sortedLines(y)) bump("reorder");
    else if (maskBinds(x) === maskBinds(y)) bump("bind");
    else bump("semantic");
  });
  // Bind changes renumber params, so the params map is expected to move too.
  if (worst === "identical" && nonSql(base) !== nonSql(head))
    bump("params/tags");
  return worst;
}

const NOTE = {
  identical: "",
  bind: "param-vs-literal or bind type changed; confirm the ClickHouse type matches the compared column",
  "params/tags":
    "SQL identical but bound values, exec fn, or route tag differ; justify",
  reorder:
    "SEMANTIC: column/clause order changed; clustered reads align result blocks by position, so order must match the legacy builder",
  semantic: "SEMANTIC: needs an explicit reason in the PR",
  "missing-on-base":
    "case not rendered on base (new case, or the base run failed; see base.log)",
  "missing-on-head":
    "case not rendered on head (deleted case, or the head run failed; see head.log)",
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = git(["rev-parse", "--show-toplevel"]);
  const head = git(["rev-parse", args.head ?? "HEAD"], { cwd: repo });
  const base = args.base
    ? git(["rev-parse", args.base], { cwd: repo })
    : git(["merge-base", head, "origin/main"], { cwd: repo });
  const tests = args.tests.length ? args.tests : defaultTests(repo, base, head);
  if (!tests.length) {
    console.error(
      "No *.golden.test.ts changed between base and head; pass test files explicitly.",
    );
    process.exit(2);
  }

  const pin = ciPin(repo);
  const { bin, version } = pickClickhouse(pin);
  const out = resolve(
    args.out ?? mkdtempSync(join(tmpdir(), "golden-equivalence-")),
  );
  mkdirSync(out, { recursive: true });

  const header = [
    `base:      ${base}`,
    `head:      ${head}`,
    `tests:     ${tests.join(", ")}`,
    `formatter: ${bin} (${version ?? "unknown"}), CI pin ${pin ?? "unknown"}${version === pin ? "" : "  <-- MISMATCH: diffs against committed snapshots will include formatter drift"}`,
  ];
  console.error(header.join("\n"));

  const sides = {};
  try {
    for (const [label, ref] of [
      ["base", base],
      ["head", head],
    ]) {
      console.error(`rendering ${label}...`);
      sides[label] = renderSide({
        repo,
        ref,
        head,
        tests,
        overlay: args.overlay,
        bin,
        workdir: out,
        label,
      });
    }
  } finally {
    if (!args.keep) {
      for (const s of Object.values(sides))
        git(["worktree", "remove", "--force", s.wt], { cwd: repo });
      git(["worktree", "prune"], { cwd: repo });
    }
  }

  const keys = [
    ...new Set([...sides.base.cases.keys(), ...sides.head.cases.keys()]),
  ].sort();
  const rows = keys.map((key) => {
    const b = sides.base.cases.get(key);
    const h = sides.head.cases.get(key);
    return { key, b, h, cls: classify(b, h) };
  });

  const casesDir = join(out, "cases");
  const lines = [
    "# Golden SQL equivalence",
    "",
    ...header.map((l) => `- ${l}`),
    "",
  ];
  for (const [label, s] of Object.entries(sides)) {
    if (s.status !== 0)
      lines.push(`- ${label} test run exited ${s.status}; see \`${s.log}\``);
  }
  lines.push("", "| # | Case | Class | Note |", "| --- | --- | --- | --- |");
  rows.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | \`${r.key.split(" :: ")[1].replace(/\|/g, "\\|")}\` | ${r.cls} | ${NOTE[r.cls]} |`,
    );
  });

  for (const [i, r] of rows.entries()) {
    if (r.cls === "identical" || r.b === undefined || r.h === undefined)
      continue;
    const slug = String(i + 1).padStart(3, "0");
    mkdirSync(casesDir, { recursive: true });
    const bf = join(casesDir, `${slug}.base.txt`);
    const hf = join(casesDir, `${slug}.head.txt`);
    // Unescape the snapshot's JSON-ish strings so the diff shows real SQL lines.
    const unescape = (s) => s.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    writeFileSync(bf, unescape(r.b));
    writeFileSync(hf, unescape(r.h));
    const d = spawnSync(
      "git",
      ["diff", "--no-index", "--no-color", "-U2", bf, hf],
      { encoding: "utf8" },
    );
    lines.push(
      "",
      `## ${i + 1}. ${r.key.split(" :: ")[1]} (${r.cls})`,
      "",
      "```diff",
      d.stdout.split("\n").slice(4).join("\n").trimEnd(),
      "```",
    );
  }

  const report = lines.join("\n") + "\n";
  writeFileSync(join(out, "report.md"), report);
  process.stdout.write(report);
  console.error(`\nreport: ${join(out, "report.md")}`);
  if (!rows.length) {
    console.error(
      "No golden cases rendered on either side; see the logs above.",
    );
    process.exit(2);
  }
  const blocking = rows.some((r) => !["identical", "bind"].includes(r.cls));
  process.exit(blocking ? 1 : 0);
}

main();
