import assert from "node:assert/strict";
import test from "node:test";
import { transformNoNestedTernary } from "./fix-no-nested-ternary.mjs";

const disable = "/* eslint-disable no-nested-ternary */\n";

test("converts a nested ternary return", async () => {
  const actual = await transformNoNestedTernary(
    `${disable}function result(a: boolean, b: boolean) {
      return a ? "a" : b ? "b" : "c";
    }`,
    "fixture.ts",
  );

  assert.equal(
    actual,
    `function result(a: boolean, b: boolean) {
  if (a) {
    return "a";
  }
  if (b) {
    return "b";
  }
  return "c";
}
`,
  );
});

test("converts both branches of an expression-bodied arrow", async () => {
  const actual = await transformNoNestedTernary(
    `${disable}const result = (a: boolean, b: boolean) =>
      a ? (b ? "ab" : "a") : b ? "b" : "none";`,
    "fixture.ts",
  );

  assert.equal(
    actual,
    `const result = (a: boolean, b: boolean) => {
  if (a) {
    if (b) {
      return "ab";
    }
    return "a";
  }
  if (b) {
    return "b";
  }
  return "none";
};
`,
  );
});

test("wraps a safe variable initializer in an IIFE", async () => {
  const actual = await transformNoNestedTernary(
    `${disable}const result = a ? "a" : b ? "b" : "c";`,
    "fixture.ts",
  );

  assert.equal(
    actual,
    `const result = (() => {
  if (a) {
    return "a";
  }
  if (b) {
    return "b";
  }
  return "c";
})();
`,
  );
});

test("does not wrap a contextually typed variable initializer", async () => {
  const source = `${disable}const result: Handler = a ? (value) => value : b ? fallback : other;`;

  assert.equal(await transformNoNestedTernary(source, "fixture.ts"), source);
});

test("keeps the disable when unsupported nested ternaries remain", async () => {
  const actual = await transformNoNestedTernary(
    `${disable}const result = render(a ? "a" : b ? "b" : "c");
const other = c ? "c" : d ? "d" : "e";`,
    "fixture.ts",
  );

  assert.match(actual, /eslint-disable no-nested-ternary/);
  assert.match(actual, /const result = render\(a \? "a" : b \? "b" : "c"\)/);
  assert.match(actual, /const other = \(\(\) =>/);
});

test("skips separator comments instead of dropping them", async () => {
  const source = `${disable}return a /* why */ ? "a" : b ? "b" : "c";`;

  assert.equal(await transformNoNestedTernary(source, "fixture.ts"), source);
});
