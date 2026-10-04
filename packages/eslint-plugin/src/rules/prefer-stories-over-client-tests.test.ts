import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import { vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    existsSync: (path: string) => {
      if (path === "/repo/Example.stories.ts") return true;
      if (path === "/repo/Other.stories.tsx") return true;
      return fs.existsSync(path);
    },
  };
});

import rule from "./prefer-stories-over-client-tests.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
  },
});

ruleTester.run("prefer-stories-over-client-tests", rule, {
  valid: [
    { code: "export {};", filename: "/repo/Unrelated.clienttest.ts" },
    { code: "export {};", filename: "/repo/Example.test.ts" },
    { code: "export {};", filename: "/repo/Example.stories.ts" },
    {
      code: "export {};",
      filename: "/repo/nested/Example.clienttest.ts",
    },
  ],
  invalid: [
    {
      code: "export {};",
      filename: "/repo/Example.clienttest.ts",
      errors: [{ messageId: "preferStories" }],
    },
    {
      code: "export {};",
      filename: "/repo/Other.clienttest.tsx",
      errors: [{ messageId: "preferStories" }],
    },
  ],
});
