import assert from "node:assert/strict";
import test from "node:test";
import { handler } from "./code-based-eval-handler.mjs";

test("returns serializable INVALID_RESULT errors for non-serializable score metadata", async () => {
  for (const metadata of [
    "(() => { const value = {}; value.self = value; return value; })()",
    "{ count: 1n }",
    "{ get value() { throw Object.create(null); } }",
    "{ toJSON() { throw Object.create(null); } }",
    "{ toJSON() { throw { toString() { throw new Error('coercion failed'); } }; } }",
    "{ toJSON() { const error = new Error(); error.message = Object.create(null); throw error; } }",
    "{ toJSON() { const error = new Error(); Object.defineProperty(error, 'message', { get() { throw new Error('message access'); } }); throw error; } }",
  ]) {
    const result = await handler({
      code: {
        source: `function evaluate() {
          return { scores: [{ name: "score", value: 1, metadata: ${metadata} }] };
        }`,
      },
      payload: {},
    });

    assert.equal(result.error?.code, "INVALID_RESULT");
    assert.match(result.error.message, /could not be serialized/);
    assert.doesNotThrow(() => JSON.stringify(result));
  }
});
