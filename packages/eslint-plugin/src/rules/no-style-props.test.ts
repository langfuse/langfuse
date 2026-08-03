import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-style-props.js";

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

ruleTester.run("no-style-props", rule, {
  valid: [
    `type InternalConfig = { style: "compact"; className: "token" };`,
    `interface InternalConfig { style: "compact"; className: "token"; }`,
    `type ButtonProps = { variant?: "primary"; size: "sm" | "md" };
     export default function Button(props: ButtonProps) { return <div className="font-medium" />; }`,
    `type ButtonProps = { variant?: "primary" };
     const Button = ({ variant }: ButtonProps) => <div className="font-medium" />;`,
    `type BaseProps = { variant?: "primary" };
     interface ButtonProps extends BaseProps { size?: "sm"; }
     function Button(props: ButtonProps) { return <div />; }`,
    `const propName = "className";
     type ButtonProps = { [propName]?: string };
     function Button(props: ButtonProps) { return <div />; }`,
    `type ButtonProps = Pick<BaseProps, "variant">;
     function Button(props: ButtonProps) { return <div />; }`,
    `type ButtonProps = number;
     function Button(props: ButtonProps) { return <div />; }`,
    `type ButtonProps = this;
     function Button(props: ButtonProps) { return <div />; }`,
    `function renderHelper({ className }: { className?: string }) { return <div />; }`,
    `function Button({ ...rest }: { variant?: "primary" }) { return <div />; }`,
    `function Button(props: { className?: string }) { return 1; }`,
    `function Button(props: { className?: string }) { if (props.className) { return 1; } return 2; }`,
    `function Button() { return; }`,
    `function Button() { const variant = "primary"; return <div />; }`,
    `function Button() { return <>content</>; }`,
    `function Button(props: string) { return <div />; }`,
    `const Button: string = "not a component";`,
    `let Button: React.FC;`,
    `const button = (props: { className?: string }) => <div />;`,
    `const { Button } = components;`,
    `class Button { props: { className?: string }; }`,
    `class Button extends BaseComponent<{ className?: string }> { render() { return <div />; } }`,
    `class Button extends React.PureComponent<{ className?: string }> { render() { return <div />; } }`,
    `class Button extends React.Component { render() { return <div />; } }`,
    `export default class extends React.Component<{ className?: string }> { render() { return <div />; } }`,
    `type ButtonProps = { ["class" + "Name"]?: string };
     function Button(props: ButtonProps) { return <div />; }`,
    `type ButtonProps = { (): void; variant?: "primary"; };
     function Button(props: ButtonProps) { return <div />; }`,
    `type ButtonProps = ButtonProps & { variant?: "primary"; };
     function Button(props: ButtonProps) { return <div />; }`,
    `interface ButtonProps { (): void; variant?: "primary"; }
     function Button(props: ButtonProps) { return <div />; }`,
    `const buttonBase = (props: { className?: string }) => <div />;
     const Button = React.memo(buttonBase);`,
    `const Button = forwardRef((props: { variant?: "primary" }) => <div />);`,
    `interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: "primary"; }
     function Button(props: ButtonProps) { return <div />; }`,
    `interface ButtonProps {}
     function Button(props: ButtonProps) { return <div />; }`,
    `interface BaseProps { variant?: "primary"; }
     interface ButtonProps extends BaseProps { size?: "sm"; }
     const Button = (props: ButtonProps) => <div />;`,
  ],
  invalid: [
    {
      code: `type ButtonProps = { className?: string };
             function Button(props: ButtonProps) { return <div />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { style?: React.CSSProperties };
             function Button(props: ButtonProps) { return <div />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "style" } }],
    },
    {
      code: `interface ButtonProps { className?: string; }
             function Button(props: ButtonProps) { return <div />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `interface ButtonProps { "style"?: React.CSSProperties; }
             function Button(props: ButtonProps) { return <div />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "style" } }],
    },
    {
      code: `type ButtonProps = { className?: string } & { variant?: "primary" };
             function Button(props: ButtonProps) { return <div />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string } | { variant?: "primary" };
             function Button(props: ButtonProps) { return <div />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type BaseProps = { style?: React.CSSProperties };
             interface ButtonProps extends BaseProps { variant?: "primary"; }
             function Button(props: ButtonProps) { return <div />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "style" } }],
    },
    {
      code: `function Button({ className }: { className?: string }) { return <div />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `function Button({ style }) { return <div />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "style" } }],
    },
    {
      code: `function Button(props: { style?: React.CSSProperties }) { return null; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "style" } }],
    },
    {
      code: `export default function (props: { className?: string }) { return <div />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `const Button = (props: { className?: string }) => null;`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `interface ButtonProps extends ButtonProps { style?: React.CSSProperties; }
             function Button(props: ButtonProps) { return <div />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "style" } }],
    },
    {
      code: `type ButtonProps = { style?: React.CSSProperties };
             const Button: React.FC<ButtonProps> = (props) => <div />;`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "style" } }],
    },
    {
      code: `const Button: React.FC<{ style?: React.CSSProperties }> = (props) => <div />;`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "style" } }],
    },
    {
      code: `type ButtonProps = { style?: React.CSSProperties };
             function Button(props: React.FC<ButtonProps>) { return <div />; }`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "style" } }],
    },
    {
      code: `type ButtonProps = { className?: string };
             function Button(props: ButtonProps) { return props.className ? <div /> : null; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             function Button(props: ButtonProps) { return props.className && <div />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             function Button(props: ButtonProps) { if (!props.className) return null; return <div />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             function Button(props: ButtonProps) { if (props.className) { return <div />; } return null; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             function Button(props: ButtonProps) { switch (props.className) { case "x": return <div />; default: return null; } }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             function Button(props: ButtonProps) { try { return <div />; } catch { return null; } }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             function Button(props: ButtonProps) { return React.createElement("div"); }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             function Button(props: ButtonProps) { return createElement("div"); }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             const Button = (props: ButtonProps) => <div /> as React.ReactNode;`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             const Button = (props: ButtonProps) => <div /> satisfies React.ReactNode;`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             const Button = (props: ButtonProps) => (<div />)!;`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string; items: string[] };
             function Button(props: ButtonProps) { return props.items.map((item) => <div key={item} />); }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string; items: string[] };
             function Button(props: ButtonProps) { return props.items.map(function Item(item) { return <div key={item} />; }); }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { style?: React.CSSProperties };
             const Button: React.FunctionComponent<ButtonProps> = (props) => <div />;`,
      errors: [{ messageId: "unexpectedProp", data: { propName: "style" } }],
    },
    {
      code: `type ButtonProps = { className?: string };
             const Button = React.memo((props: ButtonProps) => <div />);`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             const Button = memo((props: ButtonProps) => <div />);`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => <div ref={ref} />);`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => <div ref={ref} />);`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             const Button = memo(forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => <div ref={ref} />));`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             class Button extends React.Component<ButtonProps> { render() { return <div />; } }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             class Button extends Component<ButtonProps> { render() { return <div />; } }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             const Button = class extends Component<ButtonProps> { render() { return <div />; } };`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
    {
      code: `type ButtonProps = { className?: string };
             function Button(props: ButtonProps) { return <div />; }
             function IconButton(props: ButtonProps) { return <div />; }`,
      errors: [
        { messageId: "unexpectedProp", data: { propName: "className" } },
      ],
    },
  ],
});
