import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  applyStub,
  locateExport,
  markerFor,
  measure,
  parseReport,
  runCommandFor,
} from "./measure.mjs";

const SYMBOL = "packages/shared/src/server/index.ts#getGenerations";
const body = (src, span) => src.slice(span.bodyStart, span.bodyEnd);

test("locates an exported function declaration and its body span", () => {
  const src = [
    "const before = 1;",
    "export function getGenerations(input) {",
    "  return query(input);",
    "}",
    "",
  ].join("\n");
  const found = locateExport(SYMBOL, src);
  assert.equal(found.line, 2);
  assert.equal(src[found.bodyStart], "{");
  assert.equal(body(src, found), "{\n  return query(input);\n}");
});

test("locates an async function past generics and a return type", () => {
  const src =
    "export async function getGenerations<T>(input: T): Promise<Row[]> {\n" +
    "  return await run(input);\n" +
    "}";
  const found = locateExport(SYMBOL, src);
  assert.equal(found.line, 1);
  assert.equal(body(src, found), "{\n  return await run(input);\n}");
});

test("locates an arrow const with a block body", () => {
  const src =
    "export const getGenerations = async (input) => {\n" +
    "  return query(input);\n" +
    "};";
  const found = locateExport(SYMBOL, src);
  assert.equal(body(src, found), "{\n  return query(input);\n}");
});

test("locates a function-expression const", () => {
  const src = "export const getGenerations = function (input) { return 1; };";
  const found = locateExport(SYMBOL, src);
  assert.equal(body(src, found), "{ return 1; }");
});

test("spans a concise arrow body up to the terminating semicolon", () => {
  const src = "export const getGenerations = (input) => query(input) * 2;";
  const found = locateExport(SYMBOL, src);
  assert.equal(body(src, found), "query(input) * 2");
});

test("returns null for a member or method symbol", () => {
  const src = "export const prisma = makeClient();";
  assert.equal(
    locateExport("packages/shared/src/db.ts#prisma.trace.findMany", src),
    null,
  );
});

test("returns null when the export is not defined in the source", () => {
  const src = "export function somethingElse() { return 1; }";
  assert.equal(locateExport(SYMBOL, src), null);
});

test("ignores a matching name inside a string or comment", () => {
  const src = [
    "// export function getGenerations() {}",
    'const note = "export function getGenerations() {}";',
    "export function getGenerations() {\n  return real();\n}",
  ].join("\n");
  const found = locateExport(SYMBOL, src);
  assert.equal(found.line, 3);
  assert.equal(body(src, found), "{\n  return real();\n}");
});

const MARKER = `review-tests-stub:${SYMBOL}`;

test("applyStub replaces a block body with a throw of the marker", () => {
  const src = "export function getGenerations(input) {\n  return q(input);\n}";
  const stubbed = applyStub(src, locateExport(SYMBOL, src), MARKER);
  assert.equal(
    stubbed,
    'export function getGenerations(input) { throw new Error("review-tests-stub:packages/shared/src/server/index.ts#getGenerations"); }',
  );
});

test("applyStub turns a concise arrow into a throwing block", () => {
  const src = "export const getGenerations = (input) => q(input) * 2;";
  const stubbed = applyStub(src, locateExport(SYMBOL, src), MARKER);
  assert.equal(
    stubbed,
    'export const getGenerations = (input) => { throw new Error("review-tests-stub:packages/shared/src/server/index.ts#getGenerations"); };',
  );
});

// A Vitest JSON run: `testResults` per file, each with `assertionResults`.
const report = (files) => ({
  testResults: files.map(([name, assertions]) => ({
    name,
    assertionResults: assertions.map(([status, fullName, failureMessages]) => ({
      status,
      fullName,
      failureMessages: failureMessages ?? [],
    })),
  })),
});

test("returns only failed tests, and marks those carrying the stub marker", () => {
  const json = report([
    [
      "/repo/web/src/x.servertest.ts",
      [
        ["failed", "getGenerations returns rows", [`Error: ${MARKER}\n at q`]],
        ["passed", "unrelated case", []],
      ],
    ],
  ]);
  const blockTable = [
    {
      file: "web/src/x.servertest.ts",
      name: "getGenerations returns rows",
      line: 88,
    },
    { file: "web/src/x.servertest.ts", name: "unrelated case", line: 120 },
  ];
  assert.deepEqual(parseReport(json, MARKER, blockTable), [
    { marker: true, file: "web/src/x.servertest.ts", line: 88 },
  ]);
});

test("keeps a failure whose message lacks the marker as marker:false", () => {
  // A try/catch between the test and the symbol swallowed the throw, but the
  // changed behavior still failed the assertion.
  const json = report([
    [
      "/repo/web/src/y.servertest.ts",
      [
        [
          "failed",
          "swallows and asserts empty",
          ["AssertionError: expected 0"],
        ],
      ],
    ],
  ]);
  const blockTable = [
    {
      file: "web/src/y.servertest.ts",
      name: "swallows and asserts empty",
      line: 205,
    },
  ];
  assert.deepEqual(parseReport(json, MARKER, blockTable), [
    { marker: false, file: "web/src/y.servertest.ts", line: 205 },
  ]);
});

test("collapses parameterized cases to their block's single line", () => {
  const json = report([
    [
      "/repo/web/src/e.servertest.ts",
      [
        ["failed", "handles 1 items", ["AssertionError"]],
        ["failed", "handles 2 items", [`Error: ${MARKER}`]],
      ],
    ],
  ]);
  const blockTable = [
    { file: "web/src/e.servertest.ts", name: "handles %s items", line: 10 },
  ];
  // One row for the block; marker:true because one case carried the marker.
  assert.deepEqual(parseReport(json, MARKER, blockTable), [
    { marker: true, file: "web/src/e.servertest.ts", line: 10 },
  ]);
});

test("matches by ancestor titles when fullName is absent, sorted by file then line", () => {
  const json = {
    testResults: [
      {
        name: "/repo/web/src/b.servertest.ts",
        assertionResults: [
          {
            status: "failed",
            ancestorTitles: ["outer", "inner"],
            title: "does a thing",
            failureMessages: [`Error: ${MARKER}`],
          },
        ],
      },
      {
        name: "/repo/web/src/a.servertest.ts",
        assertionResults: [
          { status: "failed", fullName: "top", failureMessages: ["boom"] },
        ],
      },
    ],
  };
  const blockTable = [
    {
      file: "web/src/b.servertest.ts",
      name: "outer inner does a thing",
      line: 5,
    },
    { file: "web/src/a.servertest.ts", name: "top", line: 3 },
  ];
  assert.deepEqual(parseReport(json, MARKER, blockTable), [
    { marker: false, file: "web/src/a.servertest.ts", line: 3 },
    { marker: true, file: "web/src/b.servertest.ts", line: 5 },
  ]);
});

test("runCommandFor derives the runner from the file path", () => {
  assert.equal(
    runCommandFor("web/src/a.servertest.ts"),
    "pnpm --filter web run test web/src/a.servertest.ts",
  );
  assert.equal(
    runCommandFor("web/src/a.clienttest.tsx"),
    "pnpm --filter web run test-client web/src/a.clienttest.tsx",
  );
  assert.equal(
    runCommandFor("worker/src/a.test.ts"),
    "pnpm --filter worker run test worker/src/a.test.ts",
  );
  assert.equal(
    runCommandFor("packages/shared/src/a.test.ts"),
    "pnpm --filter @langfuse/shared run test packages/shared/src/a.test.ts",
  );
});

// A throwaway repo: one production module and one referencing test file.
const scaffold = (files) => {
  const root = mkdtempSync(join(tmpdir(), "review-tests-repo-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
};

test("measure stubs, runs, reports failures, and reverts the source", async () => {
  const moduleFile = "packages/shared/src/server/index.ts";
  const source =
    "export function getGenerations(input) {\n  return real(input);\n}\n";
  const testFile = "web/src/x.servertest.ts";
  const root = scaffold({
    [moduleFile]: source,
    [testFile]:
      'describe("getGenerations", () => {\n' +
      '  it("returns rows", () => { expect(getGenerations()).toBeTruthy(); });\n' +
      "});\n",
  });
  const marker = markerFor(`${moduleFile}#getGenerations`);
  const commands = [];
  const runFile = (runCommand) => {
    commands.push(runCommand);
    return {
      testResults: [
        {
          name: join(root, testFile),
          assertionResults: [
            {
              status: "failed",
              fullName: "getGenerations returns rows",
              failureMessages: [`Error: ${marker}`],
            },
          ],
        },
      ],
    };
  };
  try {
    const result = await measure({
      symbol: `${moduleFile}#getGenerations`,
      tests: [{ file: testFile }],
      repoRoot: root,
      runFile,
    });
    assert.deepEqual(result, {
      ok: true,
      code: { symbol: `${moduleFile}#getGenerations`, line: 1 },
      tests: [{ marker: true, file: testFile, line: 2 }],
    });
    // The runner ran the command derived from the file's path, not one supplied.
    assert.deepEqual(commands, [
      "pnpm --filter web run test web/src/x.servertest.ts",
    ]);
    assert.equal(readFileSync(join(root, moduleFile), "utf8"), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("measure lets a supplied runCommand override the derived one", async () => {
  const moduleFile = "packages/shared/src/server/index.ts";
  const source =
    "export function getGenerations(input) {\n  return real(input);\n}\n";
  const testFile = "web/src/x.servertest.ts";
  const root = scaffold({
    [moduleFile]: source,
    [testFile]: 'it("returns rows", () => { getGenerations(); });\n',
  });
  const commands = [];
  const runFile = (runCommand) => {
    commands.push(runCommand);
    return {
      testResults: [{ name: join(root, testFile), assertionResults: [] }],
    };
  };
  try {
    await measure({
      symbol: `${moduleFile}#getGenerations`,
      tests: [{ file: testFile, runCommand: "pnpm custom runner" }],
      repoRoot: root,
      runFile,
    });
    assert.deepEqual(commands, ["pnpm custom runner"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("measure reports ok:false for a member symbol without running anything", async () => {
  const moduleFile = "packages/shared/src/db.ts";
  const root = scaffold({
    [moduleFile]: "export const prisma = makeClient();\n",
  });
  let ran = false;
  try {
    const result = await measure({
      symbol: `${moduleFile}#prisma.trace.findMany`,
      tests: [{ file: "web/src/y.servertest.ts" }],
      repoRoot: root,
      runFile: () => {
        ran = true;
        return { testResults: [] };
      },
    });
    assert.deepEqual(result, {
      ok: false,
      error: "could not locate export definition to stub",
    });
    assert.equal(ran, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("measure reports ok:false when a runner crashes, and still reverts", async () => {
  const moduleFile = "packages/shared/src/server/index.ts";
  const source =
    "export function getGenerations(input) { return real(input); }\n";
  const testFile = "web/src/x.servertest.ts";
  const root = scaffold({
    [moduleFile]: source,
    [testFile]:
      'it("returns rows", () => { expect(getGenerations()).toBeTruthy(); });\n',
  });
  try {
    const result = await measure({
      symbol: `${moduleFile}#getGenerations`,
      tests: [{ file: testFile }],
      repoRoot: root,
      runFile: () => {
        throw new Error("connect ECONNREFUSED");
      },
    });
    assert.equal(result.ok, false);
    assert.match(
      result.error,
      /runner crashed for web\/src\/x\.servertest\.ts/,
    );
    assert.equal(readFileSync(join(root, moduleFile), "utf8"), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
