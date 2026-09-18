import assert from "node:assert/strict";
import test from "node:test";

import { maskCode, scanTests } from "./scan-tests.mjs";

// The mask exists to stop structural scanning from firing inside text, so the
// assertions below check that effect rather than an exact mask string.
const masked = (src, needle) => {
  const mask = maskCode(src);
  const at = src.indexOf(needle);
  assert.notEqual(at, -1, `fixture lacks ${needle}`);
  return [...needle].every((_, k) => mask[at + k] === 0);
};

test("masks line and block comments", () => {
  assert.ok(masked("a // it('x')\nb", "it('x')"));
  assert.ok(masked("a /* it('x') */ b", "it('x')"));
});

test("masks string contents but keeps surrounding code", () => {
  assert.ok(masked(`f("it(')")`, "it(')"));
  const mask = maskCode(`f("x")`);
  assert.equal(mask[0], 1, "f is code");
  assert.equal(mask[2], 1, "the opening quote is code so a name is readable");
  assert.equal(mask[3], 0, "the contents are not");
});

test("treats template interpolations as code and bodies as text", () => {
  const src = "`a${b}c`";
  const mask = maskCode(src);
  assert.ok(masked(src, "a"), "template body is text");
  assert.equal(mask[src.indexOf("b")], 1, "interpolated expression is code");
});

test("handles a brace inside a template body without closing the block", () => {
  const { tests } = scanTests(
    'describe("d", () => { it(`a}b`, () => { expect(1).toBe(1) }) })',
  );
  assert.deepEqual(
    tests.map((t) => t.name),
    ["d > a}b"],
  );
});

test("masks regex literals containing quotes and braces", () => {
  const src = "x = /it('a'){2}/g;\nit(\"real\", () => {});";
  assert.ok(masked(src, "it('a')"));
  assert.deepEqual(
    scanTests(src).tests.map((t) => t.name),
    ["real"],
  );
});

test("does not mistake division for a regex", () => {
  const src = 'const r = a / b; it("kept", () => { expect(r).toBe(2) })';
  const { tests } = scanTests(src);
  assert.deepEqual(
    tests.map((t) => t.name),
    ["kept"],
  );
});

test("builds describe > it name paths and 1-indexed lines", () => {
  const src = [
    'describe("outer", () => {',
    '  describe("inner", () => {',
    '    it("does a thing", () => {',
    "      expect(1).toBe(1);",
    "    });",
    "  });",
    '  it("sibling", () => {});',
    "});",
  ].join("\n");
  const { tests } = scanTests(src, "a.test.ts");
  assert.deepEqual(
    tests.map((t) => t.name),
    ["outer > inner > does a thing", "outer > sibling"],
  );
  assert.deepEqual(
    tests.map((t) => t.line),
    [3, 7],
  );
  assert.equal(tests[0].id, "a.test.ts::outer > inner > does a thing");
  assert.deepEqual(tests[0].describePath, ["outer", "inner"]);
});

test("keeps the template name for parameterized tests", () => {
  const src =
    'it.each([1, 2])("handles %s items", (n) => { expect(n).toBeGreaterThan(0) })';
  const { tests } = scanTests(src);
  assert.equal(tests.length, 1);
  assert.equal(tests[0].name, "handles %s items");
  assert.equal(tests[0].parameterized, true);
  assert.deepEqual(tests[0].assertions, ["expect(n).toBeGreaterThan(0)"]);
});

test("reads describe.each groups into the name path", () => {
  const src =
    'describe.each(["a"])("suite %s", (v) => { it("inner", () => {}) })';
  const { tests } = scanTests(src);
  assert.deepEqual(
    tests.map((t) => t.name),
    ["suite %s > inner"],
  );
});

test("finds a call behind an explicit type argument list", () => {
  const src =
    'it.each<{ input: string; match: string | null }>([{ input: "a", match: null }])(\n' +
    '  "matches $input",\n' +
    "  ({ input }) => { expect(input).toBe('a') },\n" +
    ");";
  const { tests } = scanTests(src);
  assert.deepEqual(
    tests.map((t) => t.name),
    ["matches $input"],
  );
});

test("does not read a JSX self-closing slash as a regex", () => {
  const src = [
    'describe("d", () => {',
    '  it("renders", () => {',
    "    render(<Table {...props} />);",
    '    expect(screen.getByRole("table")).toBeInTheDocument();',
    "  });",
    '  it("second", () => { expect(1).toBe(1) });',
    "});",
  ].join("\n");
  const { tests } = scanTests(src);
  // A mis-lexed `/>` swallows the closing paren and merges both tests into one.
  assert.deepEqual(
    tests.map((t) => t.name),
    ["d > renders", "d > second"],
  );
  assert.ok(tests[0].source.endsWith("})"), tests[0].source);
});

test("does not read a JSX closing tag slash as a regex", () => {
  const src =
    'it("a", () => { render(<div>text</div>); expect(1).toBe(1) });\nit("b", () => {});';
  const { tests } = scanTests(src);
  assert.deepEqual(
    tests.map((t) => t.name),
    ["a", "b"],
  );
});

test("still lexes a real regex literal", () => {
  const src =
    'it("a", () => { expect("x/y".replace(/\\//g, "-")).toBe("x-y") });';
  const { tests } = scanTests(src);
  assert.equal(tests.length, 1);
  assert.equal(tests[0].name, "a");
});

test("captures it.only and test.skip as tests", () => {
  const src = 'it.only("a", () => {});\ntest.skip("b", () => {});';
  const { tests } = scanTests(src);
  assert.deepEqual(
    tests.map((t) => t.name),
    ["a", "b"],
  );
});

test("captures whole assertion chains, not just expect", () => {
  const src = [
    'it("asserts", async () => {',
    "  expect(fn()).rejects.toThrow(new Error('x'));",
    "  expect(a).toEqual({ b: 1 });",
    "  await expect(p).resolves.toBe(true);",
    "});",
  ].join("\n");
  const { tests } = scanTests(src);
  assert.deepEqual(tests[0].assertions, [
    "expect(fn()).rejects.toThrow(new Error('x'))",
    "expect(a).toEqual({ b: 1 })",
    "expect(p).resolves.toBe(true)",
  ]);
});

test("ignores identifiers that merely end in it or test", () => {
  const src = 'const submit = 1; const latest = 2; it("real", () => {});';
  const { tests } = scanTests(src);
  assert.deepEqual(
    tests.map((t) => t.name),
    ["real"],
  );
});

test("does not double-count a nested it inside a test body", () => {
  const src = 'it("outer", () => { const f = () => it("inner", () => {}); });';
  const { tests } = scanTests(src);
  assert.deepEqual(
    tests.map((t) => t.name),
    ["outer"],
  );
});

test("test source is the whole balanced call", () => {
  const src =
    'describe("d", () => {\n  it("t", () => {\n    expect(1).toBe(1);\n  });\n});';
  const { tests } = scanTests(src);
  assert.equal(
    tests[0].source,
    'it("t", () => {\n    expect(1).toBe(1);\n  })',
  );
});

test("collects static, dynamic, and require imports once each", () => {
  const src = [
    'import { a } from "./a";',
    'import type { B } from "../b";',
    'import "@langfuse/shared/src/server";',
    'const c = require("./c");',
    'const d = await import("./a");',
    '// import { z } from "./commented";',
  ].join("\n");
  const { imports } = scanTests(src);
  assert.deepEqual(imports, [
    "./a",
    "../b",
    "@langfuse/shared/src/server",
    "./c",
  ]);
});

test("marks a dynamic test name rather than guessing", () => {
  const { tests } = scanTests("it(name, () => {});");
  assert.equal(tests[0].name, "<dynamic>");
});
