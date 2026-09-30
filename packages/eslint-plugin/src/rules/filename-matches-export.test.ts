import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";

import rule from "./filename-matches-export.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      ecmaFeatures: { jsx: true },
    },
  },
});

ruleTester.run("filename-matches-export", rule, {
  valid: [
    {
      code: `export function Button() { return null; }`,
      filename: "/repo/Button.tsx",
    },
    {
      code: `const Button = () => null; export { Button };`,
      filename: "/repo/Button.tsx",
    },
    {
      code: `function Button() { return null; } export default Button;`,
      filename: "/repo/Button.tsx",
    },
    {
      code: `export default function Button() { return null; }`,
      filename: "/repo/Button.tsx",
    },
    {
      code: `const InternalButton = () => null; export { InternalButton as Button };`,
      filename: "/repo/Button.tsx",
    },
    {
      code: `const InternalButton = () => null; export { InternalButton as "Button" };`,
      filename: "/repo/Button.tsx",
    },
    {
      code: `export const Button = () => null; export const ButtonShell = () => null;`,
      filename: "/repo/Button.tsx",
    },
    {
      code: `export class Button {}`,
      filename: "/repo/Button.tsx",
    },
    {
      code: `export enum Button { Primary }`,
      filename: "/repo/Button.tsx",
    },
    {
      code: `export default class Button {}`,
      filename: "/repo/Button.tsx",
    },
  ],
  invalid: [
    {
      code: `export function Button() { return null; }`,
      filename: "/repo/Link.tsx",
      errors: [{ messageId: "missing" }],
    },
    {
      code: `export type Button = { label: string };`,
      filename: "/repo/Button.tsx",
      errors: [{ messageId: "missing" }],
    },
    {
      code: `export default function () { return null; }`,
      filename: "/repo/Button.tsx",
      errors: [{ messageId: "missing" }],
    },
    {
      code: `const Button = () => null; export type { Button };`,
      filename: "/repo/Button.tsx",
      errors: [{ messageId: "missing" }],
    },
    {
      code: `export interface Button { label: string }`,
      filename: "/repo/Button.tsx",
      errors: [{ messageId: "missing" }],
    },
    {
      code: `export const { Button } = components;`,
      filename: "/repo/Button.tsx",
      errors: [{ messageId: "missing" }],
    },
    {
      code: `export default createButton();`,
      filename: "/repo/Button.tsx",
      errors: [{ messageId: "missing" }],
    },
    {
      code: `export declare function Button(): void;`,
      filename: "/repo/Button.tsx",
      errors: [{ messageId: "missing" }],
    },
    {
      code: `export namespace Internal { export const value = 1; }`,
      filename: "/repo/Button.tsx",
      errors: [{ messageId: "missing" }],
    },
    {
      code: `type Button = {}; const Link = () => null; export { type Button, Link };`,
      filename: "/repo/Button.tsx",
      errors: [{ messageId: "missing" }],
    },
  ],
});
