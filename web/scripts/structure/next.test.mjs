import assert from "node:assert/strict";
import test from "node:test";
import { computeNextItems } from "./next.mjs";

test("deep import recommendations target the declared nested capability", () => {
  const results = new Map([
    [
      8,
      [
        {
          key: "private configuration import",
          paths: [
            "src/tracing/traces/TracePage.tsx",
            "src/scores/configuration/server/scoreConfigsRouter.ts",
          ],
        },
      ],
    ],
  ]);
  const [item] = computeNextItems(results, 1);
  assert.equal(item.path, "src/scores/configuration");
  assert.equal(item.count, 1);
});
