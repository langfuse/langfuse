import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach } from "vitest";

import rule from "./prefer-stories-over-client-tests.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
  },
});

const fixture = mkdtempSync(join(process.cwd(), ".prefer-stories-test-"));
beforeEach(() => {
  writeFileSync(join(fixture, "Example.stories.ts"), "export default {};");
  writeFileSync(join(fixture, "Other.stories.tsx"), "export default {};");
});
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

ruleTester.run("prefer-stories-over-client-tests", rule, {
  valid: [
    { code: "export {};", filename: join(fixture, "Unrelated.clienttest.ts") },
    { code: "export {};", filename: join(fixture, "Example.test.ts") },
    { code: "export {};", filename: join(fixture, "Example.stories.ts") },
    {
      code: "export {};",
      filename: join(fixture, "nested/Example.clienttest.ts"),
    },
  ],
  invalid: [
    {
      code: "export {};",
      filename: join(fixture, "Example.clienttest.ts"),
      errors: [{ messageId: "preferStories" }],
    },
    {
      code: "export {};",
      filename: join(fixture, "Other.clienttest.tsx"),
      errors: [{ messageId: "preferStories" }],
    },
  ],
});
