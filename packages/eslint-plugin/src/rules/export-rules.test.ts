import { RuleTester } from "@typescript-eslint/rule-tester";
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { expect, test } from "vitest";
import rule from "./export-rules.js";

const tester = new RuleTester();
const file = (name: string) => `/tmp/${name}`;

const fns: [{ allow: unknown[] }] = [
  {
    allow: [{ kind: "function", max: 1, name: ["matchesFilename"] }, "type"],
  },
];

tester.run("export-rules", rule, {
  valid: [
    {
      code: "export function pack() { return 1; }",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export const pack = () => 1;",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export const pack = async function () { return 1; };",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "type PackOptions = { a: number };\nexport function pack(o: PackOptions) { return o.a; }\nexport { PackOptions };",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "interface PackOptions { a: number }\nexport function pack(): PackOptions { return { a: 1 }; }\nexport { PackOptions };",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "enum Color { Red }\nexport { Color };",
      filename: file("color.ts"),
      options: [{ allow: ["enum"] }],
    },
    {
      code: "import { value } from './other';\nexport { value };",
      filename: file("value.ts"),
      options: [{ allow: ["reexport"] }],
    },
    {
      code: "import value from './other';\nexport { value };",
      filename: file("value.ts"),
      options: [{ allow: ["reexport"] }],
    },
    {
      code: "declare function helper(): void;\nexport function pack() { return 1; }",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "import type { Foo } from './types';\nexport { Foo };",
      filename: file("types.ts"),
      options: [{ allow: ["type"] }],
    },
    {
      code: "interface pack { a: number }\nfunction pack() { return 1; }\nexport { pack };",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "import type { pack } from './types';\nfunction pack() { return 1; }\nexport { pack };",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "import { pack } from './other';\ninterface pack { a: number }\nexport { pack };",
      filename: file("pack.ts"),
      options: [{ allow: ["reexport"] }],
    },
    {
      code: "export function pack() { return 1; }\nexport interface FlatNode { id: string }",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export function pack() { return 1; }\nexport default interface FlatNode { id: string }",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export function pack() { return 1; }\nexport type { Foo } from './types'",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export function pack() { return 1; }\nexport function pack(value: string): string;\nexport function pack(value: number): number;",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "declare function pack(): number;\nexport { pack };",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export function pack() { return 1; }\nvoid 0;",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export function usePack(value: string): number;\nexport function usePack(value: number): number;\nexport function usePack(value: string | number) { return 1; }",
      filename: file("usePack.ts"),
      options: [{ allow: [{ kind: "hook", max: 1 }] }],
    },
    {
      code: "export function Button(props: { a: string }): JSX.Element;\nexport function Button(props: { b: string }): JSX.Element;\nexport function Button(props: { a?: string; b?: string }) { return <button />; }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export function Button() { return <button /> as JSX.Element; }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export declare function pack(value: number): number;",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export function usePack() { return 1; }",
      filename: file("usePack.ts"),
      options: [{ allow: ["hook", "type"] }],
    },
    {
      code: "export const useMobile = () => 1;",
      filename: file("use-mobile.tsx"),
      options: [{ allow: [{ kind: "hook", name: ["matchesFilename"] }] }],
    },
    {
      code: "export function slackRouter() { return 1; }",
      filename: file("slack/router.ts"),
      options: [
        {
          allow: [
            {
              kind: "function",
              max: 1,
              name: ["matchesDirname", "^(?<base>.+)Router$"],
            },
          ],
        },
      ],
    },
    {
      code: "export function Button() { return <button /> }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export const Button: React.FC = () => null;",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export const Button = memo(() => <button />);",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export const Button = Object.assign(() => <button />, { Extra: 1 });",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export class Button extends Component {}",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export class Widget {}",
      filename: file("widget.ts"),
      options: [{ allow: ["class"] }],
    },
    {
      code: "export enum Color { Red }",
      filename: file("color.ts"),
      options: [{ allow: ["enum"] }],
    },
    {
      code: "export const schema = { type: 'object' };",
      filename: file("schema.ts"),
      options: [{ allow: ["variable"] }],
    },
    {
      code: "export { value } from './other'",
      filename: file("value.ts"),
      options: [{ allow: ["reexport"] }],
    },
    {
      code: "export type Name = string",
      filename: file("name.ts"),
      options: [{ allow: ["type"] }],
    },
    {
      code: "export default function pack() { return 1; }",
      filename: file("pack.ts"),
      options: [
        {
          allow: [
            {
              kind: "function",
              max: 1,
              name: ["matchesFilename"],
              default: true,
            },
          ],
        },
      ],
    },
    {
      code: "export function left() { return 1; }\nexport function right() { return 2; }",
      filename: file("pack.ts"),
      options: [{ allow: ["function"] }],
    },
    { code: "", filename: file("pack.ts"), options: fns },
    {
      code: "export type Only = string",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export function Button() { return <button /> }",
      filename: file("Button.tsx"),
      options: [{ allow: ["function"] }],
    },
    {
      code: "function pack() { return 1; }\nexport { pack };",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export { pack };\nfunction pack() { return 1; }",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export const pack = (() => 1) as number;",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export function myPack() { return 1; }",
      filename: file("my_pack.ts"),
      options: fns,
    },
    {
      code: "export const Button = React.forwardRef(() => <button />);",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export function Button() { return condition ? <button /> : null }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export function Button() { return React.createElement('button') }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export class Button extends React.PureComponent {}",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export const Button: FC<Props> = () => <button />;",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export function pack() { return 1; }\nexport { pack as default };",
      filename: file("pack.ts"),
      options: [
        {
          allow: [
            {
              kind: "function",
              max: 2,
              name: ["matchesFilename"],
              default: true,
            },
          ],
        },
      ],
    },
    {
      code: "export declare enum Color { Red }",
      filename: file("color.ts"),
      options: [{ allow: ["enum"] }],
    },
    {
      code: "export type * from './types'",
      filename: file("types.ts"),
      options: [{ allow: ["type"] }],
    },
    {
      code: "export { type Foo, value } from './other'",
      filename: file("other.ts"),
      options: [{ allow: ["type", "reexport"] }],
    },
    {
      code: "export { 'left' as right } from './other'",
      filename: file("other.ts"),
      options: [{ allow: ["reexport"] }],
    },
    {
      code: "const Button = () => <button />;\nexport default Button;",
      filename: file("Button.tsx"),
      options: [{ allow: [{ kind: "component", default: true }] }],
    },
    {
      code: "import { x } from './x';\nexport function pack() { return x; }",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export function pack() { return 1; }\nexport { pack, type Foo };",
      filename: file("pack.ts"),
      options: fns,
    },
    {
      code: "export function Button() { return <></> }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export function Button() { return flag && <button /> }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export function Button() { return createElement('button') }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export function button() { return <button /> }",
      filename: file("button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export function Button() { if (flag) return <button />; return 1 }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export function Button() { return null }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export function Button() { return cond ? null : <button /> }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "const Inner: FC = () => null;\nexport const Button = Object.assign(Inner, {});",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "class Local {}",
      filename: file("local.ts"),
      options: [{ allow: ["class"] }],
    },
    {
      code: "export function pack() { return 1; }",
      filename: file("pack.ts"),
      options: [{ allow: [{ kind: "function", name: ["^pack$"] }] }],
    },
    {
      code: "export const Button: string = () => <button />;",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
    {
      code: "export const Button: React.Widget = () => <button />;",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
    },
  ],
  invalid: [
    {
      code: "export const VALUE = 1",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "type pack = string;\nconst pack = 1;\nexport { pack };",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export class Pack {}",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export enum Pack { A }",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export * from './other'",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export function other() { return 1; }",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "filenameMismatch" }],
    },
    {
      code: "export function pack() { return 1; }\nexport function extra() { return 2; }",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "maxExceeded" }],
    },
    {
      code: "export let pack = () => 1;",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "mutableExport" }],
    },
    {
      code: "let pack = () => 1;\nexport { pack };",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "mutableExport" }],
    },
    {
      code: "var pack = () => 1;\nexport default pack;",
      filename: file("pack.ts"),
      options: [{ allow: [{ kind: "function", default: true }] }],
      errors: [{ messageId: "mutableExport" }],
    },
    {
      code: "export var pack = 1;",
      filename: file("pack.ts"),
      options: [{ allow: ["variable"] }],
      errors: [{ messageId: "mutableExport" }],
    },
    {
      code: "export default function pack() { return 1; }",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "defaultNotAllowed" }],
    },
    {
      code: "export function router() { return 1; }",
      filename: file("slack/router.ts"),
      options: [{ allow: [{ kind: "function", name: ["matchesDirname"] }] }],
      errors: [{ messageId: "dirnameMismatch" }],
    },
    {
      code: "export function pack() { return 1; }",
      filename: file("pack.ts"),
      options: [{ allow: [{ kind: "function", name: ["^other$"] }] }],
      errors: [{ messageId: "patternMismatch" }],
    },
    {
      code: "export function usePack() { return 1; }",
      filename: file("usePack.ts"),
      options: fns,
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export interface Name { id: string }",
      filename: file("name.ts"),
      options: [{ allow: ["function"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export const pack = condition ? () => 1 : () => 2;",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export { missing };",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export function pack() { return 1; }\nexport let extra = () => 2;",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "mutableExport" }],
    },
    {
      code: "export function pack() { return 1; }\nexport default function pack() { return 1; }",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "defaultNotAllowed" }],
    },
    {
      code: "export default () => 1;",
      filename: file("pack.ts"),
      options: [
        {
          allow: [
            { kind: "function", name: ["matchesFilename"], default: true },
          ],
        },
      ],
      errors: [{ messageId: "filenameMismatch" }],
    },
    {
      code: "export function left() { return 1; }\nexport function right() { return 2; }",
      filename: file("pack.ts"),
      options: [
        { allow: [{ kind: "function", max: 1 }, { kind: "function" }] },
      ],
      errors: [{ messageId: "maxExceeded" }],
    },
    {
      code: "export function pack() { return 1; }",
      filename: file("pack.ts"),
      options: [{ allow: [{ kind: "function", max: 0 }] }],
      errors: [{ messageId: "maxExceeded" }],
    },
    {
      code: "export default class Widget {}",
      filename: file("widget.ts"),
      options: [{ allow: ["class"] }],
      errors: [{ messageId: "defaultNotAllowed" }],
    },
    {
      code: "export function helper() { return null }",
      filename: file("helper.tsx"),
      options: [{ allow: ["component"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export const Button = Object.assign(Button, {});",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export const pack;",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export const { pack } = obj;",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export { pack as 'pack' };\nfunction pack() { return 1; }",
      filename: file("pack.ts"),
      options: fns,
      errors: [{ messageId: "filenameMismatch" }],
    },
    {
      code: "export default function () { return 1; }",
      filename: file("pack.ts"),
      options: [
        {
          allow: [
            { kind: "function", name: ["matchesFilename"], default: true },
          ],
        },
      ],
      errors: [{ messageId: "filenameMismatch" }],
    },
    {
      code: "export class Button extends Other {}",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export const Button = Object.assign();",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export const Button = make();",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export function Button() { return 1 }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export function Button() { return other() }",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export class Button {}",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export namespace Box { export const value = 1 }",
      filename: file("box.ts"),
      options: [{ allow: ["function"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export default missing;",
      filename: file("missing.ts"),
      options: [{ allow: [{ kind: "function", default: true }] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "let Inner;\nexport const Button = Object.assign(Inner, {});",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export const Button = Object.assign(unknown, {});",
      filename: file("Button.tsx"),
      options: [{ allow: ["component"] }],
      errors: [{ messageId: "kindNotAllowed" }],
    },
    {
      code: "export default () => 1;",
      filename: file("pack.ts"),
      options: [
        { allow: [{ kind: "function", name: ["^pack$"], default: true }] },
      ],
      errors: [{ messageId: "patternMismatch" }],
    },
  ],
});

test("rejects invalid allow config", () => {
  const create = (options: unknown) =>
    rule.create({
      options: [options],
      filename: "/tmp/pack.ts",
      report() {},
    } as never);
  expect(() => create(null)).toThrow(/object with allow/);
  expect(() => create([])).toThrow(/object with allow/);
  expect(() => create({})).toThrow(/allow must be an array/);
  expect(() => create({ allow: [{}] })).toThrow(/empty/);
  expect(() => create({ allow: [null] })).toThrow(/kind or an object/);
  expect(() => create({ allow: [[]] })).toThrow(/kind or an object/);
  expect(() => create({ allow: ["nope"] })).toThrow(/Unknown export kind/);
  expect(() => create({ allow: [{ kind: "function", extra: true }] })).toThrow(
    /Unknown export-rules option/,
  );
  expect(() => create({ allow: [{ kind: 1 }] })).toThrow(/known kind/);
  expect(() => create({ allow: [{ kind: "nope" }] })).toThrow(/known kind/);
  expect(() => create({ allow: [{ kind: "function", max: 1.5 }] })).toThrow(
    /non-negative integer/,
  );
  expect(() => create({ allow: [{ kind: "function", max: -1 }] })).toThrow(
    /non-negative integer/,
  );
  expect(() => create({ allow: [{ kind: "function", name: [] }] })).toThrow(
    /non-empty string array/,
  );
  expect(() => create({ allow: [{ kind: "function", name: [1] }] })).toThrow(
    /non-empty string array/,
  );
  expect(() => create({ allow: [{ kind: "function", name: [""] }] })).toThrow(
    /non-empty string array/,
  );
  expect(() =>
    create({ allow: [{ kind: "function", default: "yes" }] }),
  ).toThrow(/boolean/);
  expect(() => create({ allow: [{ kind: "function", name: ["("] }] })).toThrow(
    /Invalid export-rules name pattern/,
  );
});

test("unwraps a parenthesized default function", () => {
  const declaration = {
    type: "ParenthesizedExpression",
    expression: {
      type: AST_NODE_TYPES.FunctionExpression,
      id: { type: AST_NODE_TYPES.Identifier, name: "pack" },
      params: [],
      body: { type: AST_NODE_TYPES.BlockStatement, body: [] },
    },
  };
  const program = {
    type: AST_NODE_TYPES.Program,
    body: [
      {
        type: AST_NODE_TYPES.ExportDefaultDeclaration,
        declaration,
      },
    ],
  } as unknown as TSESTree.Program;
  const reports: string[] = [];
  const visitor = rule.create({
    options: [
      {
        allow: [
          {
            kind: "function",
            max: 1,
            name: ["matchesFilename"],
            default: true,
          },
        ],
      },
    ],
    filename: "/tmp/pack.ts",
    report(descriptor: { messageId: string }) {
      reports.push(descriptor.messageId);
    },
  } as never);
  visitor.Program?.(program);
  expect(reports).toEqual([]);
});
