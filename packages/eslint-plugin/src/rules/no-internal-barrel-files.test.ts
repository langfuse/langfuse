import path from "node:path";
import { RuleTester } from "@typescript-eslint/rule-tester";
import * as parser from "@typescript-eslint/parser";
import rule from "./no-internal-barrel-files.js";

const directory = "/repo";

const tester = new RuleTester({ languageOptions: { parser } });
tester.run("no-internal-barrel-files", rule, {
  valid: [
    {
      code: "export const value = 1;",
      filename: path.join(directory, "src/value.ts"),
    },
    {
      code: 'export { value } from "./value"; export const local = 1;',
      filename: path.join(directory, "src/index.ts"),
    },
    { code: "", filename: path.join(directory, "src/empty.ts") },
    { code: "export {};", filename: path.join(directory, "src/module.ts") },
    {
      code: 'import "./setup"; export * from "./value";',
      filename: path.join(directory, "src/setup.ts"),
    },
    {
      code: "export default function value() {}",
      filename: path.join(directory, "src/value.ts"),
    },
    {
      code: "const value = 1; export { value };",
      filename: path.join(directory, "src/value.ts"),
    },
    {
      code: 'console.log("side effect"); export * from "./value";',
      filename: path.join(directory, "src/setup.ts"),
    },
  ],
  invalid: [
    ...[
      'export * from "./value";',
      'export { value as alias } from "./value";',
      'export type { Value } from "./types";',
      'export * as values from "./value";',
      'export { default } from "./value";',
      '"use client"; export { value } from "./value";',
      'import { value } from "./value"; export { value };',
      'import type { Value } from "./types"; export type { Value };',
      'import Value from "./value"; export default Value;',
    ].map((code) => ({
      code,
      filename: path.join(directory, "src/features/example/index.ts"),
      errors: [{ messageId: "unexpected" as const }],
    })),
    {
      code: 'export * from "./value";',
      filename: path.join(directory, "src/features/example/surface.ts"),
      errors: [{ messageId: "unexpected" }],
    },
    ...["src/index.ts", "web/src/pages/example/index.tsx"].map((filename) => ({
      code: 'export * from "./value";',
      filename: path.join(directory, filename),
      errors: [{ messageId: "unexpected" as const }],
    })),
  ],
});
