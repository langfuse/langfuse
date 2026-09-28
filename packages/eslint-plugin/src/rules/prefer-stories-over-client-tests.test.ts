import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import { fileURLToPath } from "node:url";

import rule from "./prefer-stories-over-client-tests.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
  },
});

const fixture = fileURLToPath(new URL("./__fixtures__/", import.meta.url));

ruleTester.run("prefer-stories-over-client-tests", rule, {
  valid: [
    { code: "export {};", filename: `${fixture}Unrelated.clienttest.ts` },
    { code: "export {};", filename: `${fixture}Example.test.ts` },
    { code: "export {};", filename: `${fixture}Example.stories.ts` },
    { code: "export {};", filename: `${fixture}nested/Example.clienttest.ts` },
  ],
  invalid: [
    {
      code: "export {};",
      filename: `${fixture}Example.clienttest.ts`,
      errors: [{ messageId: "preferStories" }],
    },
    {
      code: "export {};",
      filename: `${fixture}Other.clienttest.tsx`,
      errors: [{ messageId: "preferStories" }],
    },
  ],
});
