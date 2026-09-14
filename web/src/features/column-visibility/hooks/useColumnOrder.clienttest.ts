import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Matches `useColumnOrder("key"` and `useColumnVisibility<Row>(\n  `k-${id}`,`,
// capturing the key expression as written.
const HOOK_CALL =
  /(useColumnOrder|useColumnVisibility)\s*(?:<[^>()]*>)?\s*\(\s*([^,\n]+)/g;

const SRC = join(import.meta.dirname, "../../..");

describe("useColumnOrder", () => {
  // LFE-16287: the Users table passed one key to both hooks. They persist
  // incompatible shapes (a string list vs an object) and useLocalStorage
  // broadcasts every write into the other's state, so the column picker ran
  // `.map` on an object. The guards in both hooks stop that from throwing;
  // this stops a key-tidying refactor from re-creating the collision.
  it("shares no localStorage key with useColumnVisibility", () => {
    const keys = {
      useColumnOrder: new Set<string>(),
      useColumnVisibility: new Set<string>(),
    };

    const files = globSync("**/*.{ts,tsx}", { cwd: SRC }).filter(
      // The hooks' own signatures, and tests that pass keys on purpose.
      (file) =>
        !file.startsWith("features/column-visibility/") &&
        !file.includes(".clienttest."),
    );

    for (const file of files) {
      const source = readFileSync(join(SRC, file), "utf8");
      for (const [, hook, key] of source.matchAll(HOOK_CALL)) {
        keys[hook as keyof typeof keys].add(key.trim());
      }
    }

    // Guards the sweep itself: an empty scan must not read as "no collisions".
    expect(keys.useColumnOrder.size).toBeGreaterThan(10);
    expect(
      [...keys.useColumnOrder].filter((key) =>
        keys.useColumnVisibility.has(key),
      ),
    ).toEqual([]);
  });
});
