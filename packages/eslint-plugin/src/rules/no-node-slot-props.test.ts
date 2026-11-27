import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-node-slot-props.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("no-node-slot-props", rule, {
  valid: [
    `function Button({ children }: { children?: React.ReactNode }) { return <button>{children}</button>; }`,
    `function Button(props: { children: (item: { content: ReactNode }) => ReactNode }) { return <button />; }`,
    `function Button() { let tokenContent: ReactNode = null; return <span>{tokenContent}</span>; }`,
    `function Button(): React.ReactElement { return <button />; }`,
    `function helper(props: { icon: ReactNode }) { return props.icon; }`,
    `function Button(props: { renderItem: (item: string) => ReactNode }) { return <div />; }`,
    `type RenderItem = (item: string) => React.ReactElement;
     function Button(props: { renderItem: RenderItem }) { return <div />; }`,
    `function Button(props: { renderItem: string }) { return <div />; }`,
    `function Button(props: { icon?: string }) { return <button />; }`,
    `function Button(props: { icon: Foo.Bar.Baz }) { return <button />; }`,
    `function Button(props: { icon: Array }) { return <button />; }`,
    `function Button(props: { icon(): void }) { return <button />; }`,
    `type Slot = string;
     function Button(props: { icon: Slot }) { return <button />; }`,
    `interface ButtonProps { icon?: string }
     function Button(props: ButtonProps) { return <button />; }`,
    `interface ButtonProps { icon }
     function Button(props: ButtonProps) { return <button />; }`,
    `interface Item { label: string }
     function Button(props: { items: Item[] }) { return <button />; }`,
    `export function createColumn(options: { header: string }) { return options; }`,
    `export function createColumn() { return null; }`,
    `function Button(props: { "icon": string }) { return <button />; }`,
    `export const label = "text";`,
    `const Button = (props: { label: string }) => <button />;`,
    `export default function Button(props: { label: string }) { return <button />; }`,
    `type Slot = Slot;
     function Button(props: { icon: Slot }) { return <button />; }`,
    {
      code: `function Button(props: { loadingCell: React.ReactNode }) { return <button />; }`,
      options: [{ allowedPropNames: ["children", "loadingCell"] }],
    },
  ],
  invalid: [
    {
      code: `function Button(props: { renderItem: React.ReactNode }) { return <div />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "renderItem" } },
      ],
    },
    {
      code: `function Button(props: { label: string; icon: ReactNode }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: React.ReactNode }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { icon: ReactElement }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { icon: React.ReactElement }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { icon: JSX.Element }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { icon: ReactNode | null }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { icon: string & ReactNode }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { icon: ReactNode[] }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { icon: Array<ReactNode> }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { icon: (value: string) => ReactNode }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { dropdown: { label: ReactNode } }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "label" } }],
    },
    {
      code: `type Item = { badge?: React.ReactNode };
             function Button(props: { items: Item[] }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "badge" } }],
    },
    {
      code: `type Slot = React.ReactNode;
             function Button(props: { icon: Slot; badge: Slot }) { return <button />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "icon" } },
        { messageId: "unexpectedProp", data: { propName: "badge" } },
      ],
    },
    {
      code: `type Slot = React.ReactNode;
             function Button(props: { icon: Slot }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { label: string; icon(): ReactNode }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `export function createColumn(options: { loadingCell: React.ReactNode }) { return options; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "loadingCell" } },
      ],
    },
    {
      code: `export default (props: { icon: ReactNode }) => <button />;`,
      errors: [{ messageId: "unexpectedProp" }],
    },
    {
      code: `function Button(props: { menu: { [key: string]: string; icon: ReactNode } }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp" }],
    },
  ],
});
