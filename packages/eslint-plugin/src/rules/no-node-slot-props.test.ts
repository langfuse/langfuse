import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-node-slot-props.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run("no-node-slot-props", rule, {
  valid: [
    `type ButtonProps = { label: string };
     function Button(props: ButtonProps) { return <button />; }`,
    `function Button({ children }: { children?: React.ReactNode }) { return <button>{children}</button>; }`,
    `function Button(props: { children: (item: { content: ReactNode }) => ReactNode }) { return <button />; }`,
    `function Button() { let tokenContent: ReactNode = null; return <span>{tokenContent}</span>; }`,
    `function Button(): React.ReactElement { return <button />; }`,
    `function helper(props: { icon: ReactNode }) { return props.icon; }`,
    `type Internal = { icon: ReactNode };`,
    `function Button(props: { renderItem: (item: string) => ReactNode }) { return <div />; }`,
    `type RenderItem = (item: string) => React.ReactElement;
     function Button(props: { renderItem: RenderItem }) { return <div />; }`,
    `interface NotAFunction { label: string }
     function Button(props: { renderItem: NotAFunction }) { return <div />; }`,
    `const value = "text";
     const Button = value;`,
    `export const label = "text";`,
    `export default function Button(props: { label: string }) { return <button />; }`,
    `function Button(props: { icon?: string }) { return <button />; }`,
    `function Button(props: { ["icon"]: string }) { return <button />; }`,
    `function Button(props: { icon: () => void }) { return <button />; }`,
    `type Slot = string;
     function Button(props: { icon: Slot }) { return <button />; }`,
    `function Button(props: { icon: string | number }) { return <button />; }`,
    `function Button(props: { icon: [string, number] }) { return <button />; }`,
    `function Button(props: { icon: Array<string> }) { return <button />; }`,
    `interface ButtonProps { label: string }
     function Button(props: ButtonProps) { return <button />; }`,
    `interface Base { label: string }
     interface ButtonProps extends Base { size: number }
     function Button(props: ButtonProps) { return <button />; }`,
    `interface ButtonProps extends React.HTMLAttributes<HTMLButtonElement> { label: string }
     function Button(props: ButtonProps) { return <button />; }`,
    `function Button(props: { onSelect: (content: ReactNode) => void }) { return <button />; }`,
    `function Button(props: { icon: Foo.ReactNode }) { return <button />; }`,
    `function Button(props: { icon: Foo.Bar.ReactNode }) { return <button />; }`,
    `function Button(props: { icon: Element }) { return <button />; }`,
    `function Button(props: { icon: Array }) { return <button />; }`,
    `function Button(props: { icon: Missing }) { return <button />; }`,
    `function Button(props: { icon: keyof { a: string } }) { return <button />; }`,
    `function Button(props: { renderItem: string }) { return <button />; }`,
    `function Button(props: { renderItem: Foo.Bar.Baz }) { return <button />; }`,
    `interface ButtonProps { icon; label: string }
     function Button(props: ButtonProps) { return <button />; }`,
    `function Button(props: { [key: string]: string; label: string }) { return <button />; }`,
    `function Button(props) { return <button />; }`,
    `const { Button } = { Button: 1 };`,
    `export default function (props: { label: string }) { return <button />; }`,
    `function Button(props: { 0: string }) { return <button />; }`,
    {
      code: `function Button(props: { icon: ReactNode }) { return <button />; }`,
      options: [{ allowedPropNames: ["children", "icon"] }],
    },
  ],
  invalid: [
    {
      code: `function Button(props: { icon: ReactNode }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: React.ReactNode }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: ReactElement }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: React.ReactElement }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: JSX.Element }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: ReactNode | null }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: string & ReactNode }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: ReactNode[] }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: readonly ReactNode[] }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: Array<ReactNode> }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: [ReactNode, string] }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: (value: string) => ReactNode }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `type Slot = React.ReactNode;
             function Button(props: { icon: Slot }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `type Option = { icon: ReactNode };
             function Button(props: { option: Option }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `interface Item { badge?: React.ReactNode }
             function Menu(props: { items: Item[] }) { return <div />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "badge" } }],
    },
    {
      code: `interface Item { badge?: JSX.Element }
             interface MenuProps { items: ReadonlyArray<Item> }
             function Menu(props: MenuProps) { return <div />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "badge" } }],
    },
    {
      code: `interface Base { icon: ReactNode }
             interface ButtonProps extends Base { label: string }
             function Button(props: ButtonProps) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { dropdown: { label: ReactNode } }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "label" } }],
    },
    {
      code: `function Button(props: { icon(): ReactNode }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `export function createColumn(options: { loadingCell: React.ReactNode }) { return options; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "loadingCell" } },
      ],
    },
    {
      code: `export const createColumn = (options: { loadingCell: ReactNode | (() => ReactNode) }) => options;`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "loadingCell" } },
      ],
    },
    {
      code: `function Button(props: { renderItem: (item: string) => ReactNode }) { return <div />; }`,
      options: [{ exemptRenderCallbacks: false }],
      errors: [
        { messageId: "unexpectedProp", data: { propName: "renderItem" } },
      ],
    },
    {
      code: `type Alias = (item: string) => ReactNode;
             function Button(props: { renderItem: Alias }) { return <div />; }`,
      options: [
        { exemptRenderCallbacks: false, allowedPropNames: ["children"] },
      ],
      errors: [
        { messageId: "unexpectedProp", data: { propName: "renderItem" } },
      ],
    },
    {
      code: `export default (props: { icon: ReactNode }) => <button />;`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
    {
      code: `function Button(props: { icon: (ReactNode) }) { return <button />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "icon" } }],
    },
  ],
});
