import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  auditMoves,
  fixSource,
  removeSuppression,
} from "./fix-no-use-before-define.mjs";

const require = createRequire(
  new URL("../worker/package.json", import.meta.url),
);
const { ESLint } = require("eslint");
const configRequire = createRequire(
  new URL("../packages/config-eslint/package.json", import.meta.url),
);
const tseslint = configRequire("typescript-eslint");
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser },
      plugins: { "@typescript-eslint": tseslint.plugin },
      rules: { "@typescript-eslint/no-use-before-define": "error" },
    },
  ],
});
const path = resolve("worker/src/no-use-before-define-fixture.ts");
const header = "/* eslint-disable @typescript-eslint/no-use-before-define */\n";
const lint = async (text, filePath) =>
  (await eslint.lintText(text, { filePath }))[0].messages;
const fix = (text) => fixSource(header + text, path, lint);

test("moves function dependencies and documentation, preserving declaration forms", async () => {
  const result = await fix(
    "export function run() { return helper(); }\n/** Helper docs. */\nfunction helper() { return 1; }\n",
  );
  assert.ok(result.text);
  assert.ok(
    result.text.indexOf("/** Helper docs. */") <
      result.text.indexOf("function helper"),
  );
  assert.ok(
    result.text.indexOf("function helper") <
      result.text.indexOf("export function run"),
  );
  assert.equal(
    (await lint(result.text, path)).filter(
      (m) => m.ruleId === "@typescript-eslint/no-use-before-define",
    ).length,
    0,
  );
  assert.equal(
    (await fixSource(result.text, path, lint)).reason,
    "no supported file-level suppression",
  );
});

test("does not move runtime initializers, even after an initially safe fix", async () => {
  const result = await fix(
    "function run() { return helper() + value; }\nfunction helper() { return 1; }\nconst value = sideEffect();\n",
  );
  assert.ok(result.reason);
  assert.equal(result.text, undefined);
});

test("skips arrows, classes, nested functions, overloads, and cycles", async () => {
  for (const text of [
    "const run = () => helper();\nconst helper = () => 1;\n",
    "function run() { return new Later(); }\nclass Later {}\n",
    "function outer() { return helper(); function helper() { return 1; } }\n",
    "function run() { return helper(); }\nfunction helper(): number;\nfunction helper() { return 1; }\n",
    "function a() { return b(); }\nfunction b() { return a(); }\n",
  ]) {
    const result = await fix(text);
    assert.ok(result.reason, text);
    assert.equal(result.text, undefined);
  }
});

test("resolves shadowed symbols rather than matching names", async () => {
  const result = await fix(
    "function run(helper: () => number) { return helper(); }\nconst helper = sideEffect();\n",
  );
  assert.equal(
    result.text,
    "function run(helper: () => number) { return helper(); }\nconst helper = sideEffect();\n",
  );
});

test("preserves unrelated disabled rules", () => {
  assert.equal(
    removeSuppression(
      "/* eslint-disable no-nested-ternary, @typescript-eslint/no-use-before-define */\ncode",
    ),
    "/* eslint-disable no-nested-ternary */\ncode",
  );
});

test("preserves runtime statement order and directive prologues", async () => {
  const original =
    '"use client";\nsideEffect();\nexport function run() { return helper(); }\nfunction helper() { return 1; }\nafterEffect();\n';
  const result = await fix(original);
  assert.ok(result.text);
  assert.equal(auditMoves(header + original, result.text, path), undefined);
  assert.ok(result.text.startsWith('"use client";'));
  assert.ok(
    result.text.indexOf("sideEffect();") <
      result.text.indexOf("afterEffect();"),
  );
});

test("skips comment directives and runtime dependencies of moved helpers", async () => {
  for (const original of [
    "function run() { return helper(); }\n// @ts-ignore\nfunction helper() { return 1; }\n",
    "function run() { return helper(); }\nconst value = sideEffect();\nfunction helper() { return value; }\n",
  ]) {
    const result = await fix(original);
    assert.ok(result.reason);
    assert.equal(result.text, undefined);
  }
});

test("audit rejects changed bodies, lost comments, and reordered side effects", () => {
  assert.ok(
    auditMoves(
      "function a() { return 1; }",
      "function a() { return 2; }",
      path,
    ),
  );
  assert.ok(
    auditMoves("/** Docs */\nfunction a() {}", "function a() {}", path),
  );
  assert.ok(auditMoves("a();\nb();", "b();\na();", path));
});

test("never inserts a helper into an overload group", async () => {
  const original =
    "function run(): number;\nfunction run() { return helper(); }\nfunction helper() { return 1; }\n";
  const result = await fix(original);
  assert.match(result.reason, /overload/);
  assert.equal(result.text, undefined);
});
