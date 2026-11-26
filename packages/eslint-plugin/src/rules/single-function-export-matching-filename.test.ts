import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./single-function-export-matching-filename.js";

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

function file(name: string) {
  return `/tmp/${name}`;
}

const count = (count: number) => [
  { messageId: "count" as const, data: { count: String(count) } },
];
const filename = (name: string) => [
  { messageId: "filename" as const, data: { name } },
];

ruleTester.run("single-function-export-matching-filename", rule, {
  valid: [
    { code: "export function pack() { return 1; }", filename: file("pack.ts") },
    {
      code: "export async function pack() { return 1; }",
      filename: file("pack.ts"),
    },
    {
      code: "export const pack = () => 1;",
      filename: file("pack.ts"),
    },
    {
      code: "export const pack = async () => 1;",
      filename: file("pack.tsx"),
    },
    {
      code: "export const pack = function () { return 1; };",
      filename: file("pack.ts"),
    },
    {
      code: "export const pack = async function pack() { return 1; };",
      filename: file("pack.ts"),
    },
    {
      code: "function helper() { return 1; }\nexport function pack() { return helper(); }",
      filename: file("pack.ts"),
    },
    {
      code: "const helper = () => 1;\nexport const pack = () => helper();",
      filename: file("pack.ts"),
    },
    {
      code: "const pack = () => 1;\nexport { pack };",
      filename: file("pack.ts"),
    },
    {
      code: "export { pack };\nconst pack = () => 1;",
      filename: file("pack.ts"),
    },
    {
      code: "const pack = () => 1;\nexport { pack as pack };",
      filename: file("pack.ts"),
    },
    {
      code: "import { value } from './types';\nexport function pack() { return value; }",
      filename: file("pack.ts"),
    },
    {
      code: "export default function pack() { return 1; }",
      filename: file("pack.ts"),
    },
    {
      code: "const pack = () => 1;\nexport default pack;",
      filename: file("pack.ts"),
    },
    {
      code: "export default (function pack() { return 1; });",
      filename: file("pack.ts"),
    },
    {
      code: "const other = () => 1;\nexport { other as pack };",
      filename: file("pack.ts"),
    },
    {
      code: "const { helper } = { helper: 1 };\nexport function pack() { return helper; }",
      filename: file("pack.ts"),
    },
    {
      code: "let value;\nexport function pack() { return value; }",
      filename: file("pack.ts"),
    },
    {
      code: "const pack = () => 1;\nexport { pack as default };",
      filename: file("pack.ts"),
    },
    {
      code: "export function pack(value: string): string;\nexport function pack(value: number): number;\nexport function pack(value: string | number) { return value; }",
      filename: file("pack.ts"),
    },
    {
      code: "export declare function pack(value: string): string;",
      filename: file("pack.ts"),
    },
  ],
  invalid: [
    { code: "", filename: file("pack.ts"), errors: count(0) },
    { code: "export {};", filename: file("pack.ts"), errors: count(0) },
    {
      code: "export const VALUE = 1;",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export type Foo = string;",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export interface Foo { id: string }",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export enum Kind { A }",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export class Box {}",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export * from './other';",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export { value } from './other';",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export { left, right } from './other';",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export type { Foo } from './types';",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export declare function left(value: string): string;\nexport declare function right(value: number): number;",
      filename: file("pack.ts"),
      errors: count(2),
    },
    {
      code: "export function left() { return 1; }\nexport function right() { return 2; }",
      filename: file("pack.ts"),
      errors: count(2),
    },
    {
      code: "export function pack() { return 1; }\nexport { pack as default };",
      filename: file("pack.ts"),
      errors: count(2),
    },
    {
      code: "const pack = () => 1;\nexport { pack };\nexport default pack;",
      filename: file("pack.ts"),
      errors: count(2),
    },
    {
      code: "export const left = () => 1, right = () => 2;",
      filename: file("pack.ts"),
      errors: count(2),
    },
    {
      code: "export function pack() { return 1; }\nexport const EXTRA = 1;",
      filename: file("pack.ts"),
      errors: count(2),
    },
    {
      code: "export function pack() { return 1; }\nexport type Foo = string;",
      filename: file("pack.ts"),
      errors: count(2),
    },
    {
      code: "const pack = () => 1;\nconst other = () => 2;\nexport { pack, other };",
      filename: file("pack.ts"),
      errors: count(2),
    },
    {
      code: "const pack = () => 1;\ntype Foo = string;\nexport { pack, type Foo };",
      filename: file("pack.ts"),
      errors: count(2),
    },
    {
      code: "export default 1;",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export default class Box {}",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "const value = 1;\nexport default value;",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export const { value } = { value: 1 };",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export const pack = condition ? () => 1 : () => 2;",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "const pack = () => 1;\nexport { pack, missing };",
      filename: file("pack.ts"),
      errors: count(2),
    },
    {
      code: "const pack = 1;\nfunction helper() { function pack() { return 1; } const inner = () => pack(); return inner; }\nexport { pack };\nvoid helper;",
      filename: file("pack.ts"),
      errors: count(0),
    },
    {
      code: "export function other() { return 1; }",
      filename: file("pack.ts"),
      errors: filename("pack"),
    },
    {
      code: "export const other = () => 1;",
      filename: file("pack.ts"),
      errors: filename("pack"),
    },
    {
      code: "const pack = () => 1;\nexport { pack as other };",
      filename: file("pack.ts"),
      errors: filename("pack"),
    },
    {
      code: "export default function other() { return 1; }",
      filename: file("pack.ts"),
      errors: filename("pack"),
    },
    {
      code: "export default () => 1;",
      filename: file("pack.ts"),
      errors: filename("pack"),
    },
    {
      code: "export default function () { return 1; }",
      filename: file("pack.ts"),
      errors: filename("pack"),
    },
    {
      code: "export default (function () { return 1; });",
      filename: file("pack.ts"),
      errors: filename("pack"),
    },
    {
      code: 'const pack = () => 1;\nexport { pack as "pack" };',
      filename: file("pack.ts"),
      errors: filename("pack"),
    },
  ],
});
