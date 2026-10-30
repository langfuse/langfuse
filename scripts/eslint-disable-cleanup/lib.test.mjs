import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CHANGED_LINES,
  buildAllowedTools,
  diffDirectiveCounts,
  isScannablePath,
  parseDirectives,
  parseOpenBatchMetadata,
  selectBatch,
  validateBatchEdit,
} from "./lib.mjs";

test("parses file, next-line, and line disables without keeping descriptions", () => {
  const source = [
    "/* eslint-disable no-console, eqeqeq -- legacy */",
    "const value = 1; // eslint-disable-line no-console",
    "// eslint-disable-next-line @repo/no-style-props",
    "/* eslint-disable */",
  ].join("\n");
  const directives = parseDirectives(source, "web/src/example.tsx");
  assert.equal(directives.length, 4);
  assert.deepEqual(directives[0].rules, ["eqeqeq", "no-console"]);
  assert.equal(directives[0].kind, "eslint-disable");
  assert.equal(directives[1].kind, "eslint-disable-line");
  assert.deepEqual(directives[2].rules, ["@repo/no-style-props"]);
  assert.deepEqual(directives[3].rules, ["*"]);
});

test("skips generated files and unsafe paths", () => {
  assert.equal(isScannablePath("generated/api.ts"), false);
  assert.equal(isScannablePath("packages/shared/prisma/generated/client.ts"), false);
  assert.equal(isScannablePath("packages/native/index.d.ts"), false);
  assert.equal(isScannablePath("web/src/workers/generated/json-parser.worker.source.ts"), false);
  assert.equal(isScannablePath("web/src/components/Foo.tsx"), true);
  assert.equal(isScannablePath("web/src/odd path.ts"), false);
  assert.equal(isScannablePath("worker/dist/index.js"), false);
});

test("selects the smallest whole file before a same-rule group", () => {
  const directives = [
    ...parseDirectives("/* eslint-disable no-console */\n", "web/src/b.tsx"),
    ...parseDirectives(
      "/* eslint-disable no-console */\n/* eslint-disable eqeqeq */\n",
      "web/src/a.tsx",
    ),
    ...parseDirectives("// eslint-disable-next-line no-console\n", "web/src/c.tsx"),
  ];
  const batch = selectBatch({ directives });
  assert.equal(batch.mode, "file");
  assert.deepEqual(batch.files, ["web/src/b.tsx"]);
});

test("skips an open file batch and then picks one issue from a larger file", () => {
  const many = Array.from({ length: 8 }, () => "/* eslint-disable no-console */").join("\n");
  const directives = parseDirectives(many, "web/src/large.tsx");
  const batch = selectBatch({
    directives,
    skippedKeys: [],
  });
  assert.equal(batch.mode, "issue");
  assert.equal(batch.files.length, 1);
  assert.equal(batch.directives.length, 1);
});

test("uses a same-rule batch only when whole-file and single-issue keys are skipped", () => {
  const directives = [
    ...parseDirectives("// eslint-disable-next-line no-console\n", "web/src/a.tsx"),
    ...parseDirectives("// eslint-disable-next-line no-console\n", "web/src/b.tsx"),
  ];
  const skippedKeys = ["file:web/src/a.tsx", "file:web/src/b.tsx"];
  const firstIssue = selectBatch({ directives });
  skippedKeys.push(firstIssue ? occurrenceKeyForFirst(directives, "web/src/a.tsx") : "");
  skippedKeys.push(occurrenceKeyForFirst(directives, "web/src/b.tsx"));
  const batch = selectBatch({ directives, skippedKeys });
  assert.equal(batch.mode, "rule");
  assert.equal(batch.rule, "no-console");
  assert.deepEqual(batch.files, ["web/src/a.tsx", "web/src/b.tsx"]);
});

test("does not mix a second rule into a rule batch", () => {
  const directives = [
    ...parseDirectives("// eslint-disable-next-line no-console\n", "web/src/a.tsx"),
    ...parseDirectives("// eslint-disable-next-line eqeqeq\n", "web/src/b.tsx"),
  ];
  const batch = selectBatch({
    directives,
    skippedKeys: [
      "file:web/src/a.tsx",
      "file:web/src/b.tsx",
      occurrenceKeyForFirst(directives, "web/src/a.tsx"),
      occurrenceKeyForFirst(directives, "web/src/b.tsx"),
    ],
  });
  assert.equal(batch, null);
});

test("rejects a widened disable and a file outside the batch", () => {
  const before = parseDirectives("/* eslint-disable no-console */\n", "web/src/a.tsx");
  const after = parseDirectives(
    "/* eslint-disable eqeqeq, no-console */\n",
    "web/src/a.tsx",
  );
  const errors = validateBatchEdit({
    beforeByFile: new Map([["web/src/a.tsx", before]]),
    afterByFile: new Map([["web/src/a.tsx", after]]),
    batch: {
      batchKey: "file:web/src/a.tsx",
      mode: "file",
      files: ["web/src/a.tsx"],
      directives: before,
    },
    changedFiles: ["web/src/a.tsx", "web/src/other.tsx"],
    changedLineCount: 2,
  });
  assert.ok(errors.some((error) => error.includes("outside the selected batch")));
  assert.ok(errors.some((error) => error.includes("added or widened")));
});

test("accepts removal of the selected directive only", () => {
  const source = "/* eslint-disable no-console */\n// eslint-disable-next-line eqeqeq\n";
  const before = parseDirectives(source, "web/src/a.tsx");
  const selected = before.filter((directive) => directive.rules.includes("no-console"));
  const after = parseDirectives("// eslint-disable-next-line eqeqeq\n", "web/src/a.tsx");
  const errors = validateBatchEdit({
    beforeByFile: new Map([["web/src/a.tsx", before]]),
    afterByFile: new Map([["web/src/a.tsx", after]]),
    batch: {
      batchKey: "issue:test",
      mode: "issue",
      files: ["web/src/a.tsx"],
      directives: selected,
    },
    changedFiles: ["web/src/a.tsx"],
    changedLineCount: 4,
  });
  assert.deepEqual(errors, []);
});

test("rejects diffs at the line cap", () => {
  const before = parseDirectives("/* eslint-disable no-console */\n", "web/src/a.tsx");
  const errors = validateBatchEdit({
    beforeByFile: new Map([["web/src/a.tsx", before]]),
    afterByFile: new Map([["web/src/a.tsx", []]]),
    batch: {
      batchKey: "file:web/src/a.tsx",
      mode: "file",
      files: ["web/src/a.tsx"],
      directives: before,
    },
    changedFiles: ["web/src/a.tsx"],
    changedLineCount: MAX_CHANGED_LINES + 1,
  });
  assert.ok(errors.some((error) => error.includes("changed lines")));
});

test("allowed tools name only the selected file", () => {
  const tools = buildAllowedTools(["web/src/components/Foo.tsx"]);
  assert.match(tools, /Edit\(\/web\/src\/components\/Foo\.tsx\)/);
  assert.doesNotMatch(tools, /Edit\(\/\*\)/);
  assert.match(tools, /Bash\(node scripts\/eslint-disable-cleanup\/lint-changed\.mjs\)/);
  assert.throws(() => buildAllowedTools(["generated/api.ts"]));
});

test("reads batch keys and files from open pull request bodies", () => {
  const parsed = parseOpenBatchMetadata([
    {
      body: "Batch-Key: file:web/src/a.tsx\nBatch-Files: web/src/a.tsx\n",
    },
  ]);
  assert.deepEqual(parsed.skippedKeys, ["file:web/src/a.tsx"]);
  assert.deepEqual(parsed.blockedFiles, ["web/src/a.tsx"]);
});

test("directive diff counts additions separately from removals", () => {
  const before = parseDirectives("/* eslint-disable no-console */\n", "web/src/a.tsx");
  const after = parseDirectives("/* eslint-disable eqeqeq */\n", "web/src/a.tsx");
  const diff = diffDirectiveCounts(before, after);
  assert.equal(diff.removed.size, 1);
  assert.equal(diff.added.size, 1);
});

function occurrenceKeyForFirst(directives, file) {
  const directive = directives.find((item) => item.file === file);
  return `issue:${directive.file}:${directive.kind}:${directive.rules.join("+")}:0`;
}
