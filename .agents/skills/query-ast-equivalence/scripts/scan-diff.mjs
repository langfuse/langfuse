#!/usr/bin/env node
// Point at every added line a query-AST migration review must answer for:
// raw SQL in the builder, TypeScript escape hatches, infrastructure concerns
// at call sites, multi-project scope, and changed comments.
//
//   node scan-diff.mjs [--base <ref>] [--head <ref>]
//
// Heuristic grep over `git diff -U0 base...head`, non-test .ts only. Every hit
// needs an answer, not necessarily a change.

import { execFileSync } from "node:child_process";

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 << 20 }).trim();

const args = { head: "HEAD" };
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--base") args.base = process.argv[++i];
  else if (process.argv[i] === "--head") args.head = process.argv[++i];
}
const base = args.base ?? git(["merge-base", args.head, "origin/main"]);

const CHECKS = [
  {
    id: "raw-sql",
    question: "Why can't the typed builder express this?",
    re: /\bsql`|\bsql\.(raw|ref|lit|id|join)\(/,
  },
  {
    id: "ts-escape",
    question: "What does this cast or assertion hide?",
    re: /\bas never\b|\bas unknown as\b|\bas any\b|@ts-(expect-error|ignore)|[\w)\]]!(?=[.[),;\s])/,
  },
  {
    id: "infra-at-call-site",
    question:
      "Does this belong in the registry or compiler instead of the call site?",
    re: /is_deleted|\bFINAL\b|LIMIT \d+ BY|convertDateTo\w*|toDateTime64?\(|parseDateTime|project_id|toIntervalDay|interval \d/i,
  },
  {
    id: "multi-project",
    question:
      "Is this a single-project scope? Multi-project needs a reason plus an org-id guard.",
    re: /projectIds\b|project_id\s+IN\b|projectId:\s*\[|organizationId|orgId/,
  },
  {
    id: "copied-expression",
    question:
      "Is this copied from a builder map still used elsewhere? Derive it from the map.",
    // A ClickHouse function call (with -If/-Merge/-State combinators) or an
    // `expr AS alias` inside a string/template literal.
    re: /["'`][^"'`]*(\b(any|anyLast|argMax|min|max|sum|count|if|multiIf|dateDiff|groupArray|groupUniqArray|leftUTF8)(If|Merge|State)?\(|\)\s+AS\s+\w+)/i,
  },
];

const diff = git([
  "diff",
  "-U0",
  "--no-color",
  `${base}...${args.head}`,
  "--",
  "*.ts",
  ":(exclude)*.test.ts",
  ":(exclude)*.assert.ts",
  ":(exclude)**/fixtures/**",
]);

const hits = Object.fromEntries(CHECKS.map((c) => [c.id, []]));
const comments = [];
let file = "";
let line = 0;
for (const raw of diff.split("\n")) {
  if (raw.startsWith("+++ ")) {
    file = raw.slice(6);
    continue;
  }
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
  if (hunk) {
    line = Number(hunk[1]);
    continue;
  }
  if (raw.startsWith("-") && !raw.startsWith("---")) {
    if (/^-\s*(\/\/|\/?\*)/.test(raw))
      comments.push(`${file} (removed) ${raw.slice(1).trim()}`);
    continue;
  }
  if (!raw.startsWith("+") || raw.startsWith("+++")) continue;
  const text = raw.slice(1);
  const isComment = /^\s*(\/\/|\/?\*)/.test(text);
  if (isComment) comments.push(`${file}:${line} ${text.trim()}`);
  else {
    for (const c of CHECKS)
      if (c.re.test(text)) hits[c.id].push(`${file}:${line}  ${text.trim()}`);
  }
  line++;
}

console.log(`base ${base.slice(0, 10)}  head ${args.head}\n`);
for (const c of CHECKS) {
  console.log(`## ${c.id} (${hits[c.id].length}) — ${c.question}`);
  for (const h of hits[c.id]) console.log(`  ${h}`);
  console.log("");
}
console.log(
  `## comments (${comments.length}) — Does each still describe the code? Any stray edit?`,
);
for (const h of comments) console.log(`  ${h}`);
