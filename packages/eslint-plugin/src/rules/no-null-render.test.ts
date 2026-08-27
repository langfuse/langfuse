import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";

import rule from "./no-null-render.js";

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

const unexpectedNullishRender = {
  messageId: "unexpectedNullishRender" as const,
};

ruleTester.run("no-null-render", rule, {
  valid: [
    `function helper() { return null; }`,
    `const helper = () => null;`,
    `const helper = () => undefined;`,
    `function Comp() { return <div />; }`,
    `const Comp = () => <div />;`,
    `function Comp() { return <>content</>; }`,
    `function Comp({ show }: { show: boolean }) {
       return <div>{show ? <span /> : null}</div>;
     }`,
    `function Comp({ show }: { show: boolean }) {
       return <>{show ? <span /> : null}</>;
     }`,
    `function Comp({ show }: { show: boolean }) {
       return <div>{show && <span />}</div>;
     }`,
    `function Comp() {
       const helper = () => null;
       return <div>{helper()}</div>;
     }`,
    `function Comp({ n }: { n: number }) {
       if (n) return 1;
       return <div />;
     }`,
    `function Comp() { return false; }`,
    `function Comp() { return; }`,
    `function notAComponent() { return 1; }`,
    `const button = () => <div />;`,
    `export default function () { return <main />; }`,
    `function Comp({ visible }: { visible: boolean }) {
       if (visible) return <div />;
       return <span />;
     }`,
    `const Comp = memo(() => <div />);`,
    `const Comp = forwardRef(() => <div />);`,
    `const Comp = React.memo(() => <div />);`,
    `function Comp() { return items.map((item) => null); }`,
    `function Comp() {
       const a = b;
       const b = a;
       return a;
     }`,
    `function Comp({ node }: { node: React.ReactNode }) {
       if (node) return node;
       return <div />;
     }`,
  ],
  invalid: [
    {
      code: `function Comp() { return null; }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `const Comp = () => null;`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               return show ? <div /> : undefined;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `const Comp = ({ show }: { show: boolean }) =>
               show ? <div /> : undefined;`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               if (!show) return null;
               return <div />;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               if (!show) return undefined;
               return <div />;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               return show ? <div /> : null;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               return show ? null : <div />;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ a, b }: { a: boolean; b: boolean }) {
               return a ? (b ? <div /> : null) : <span />;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ a, b }: { a: boolean; b: boolean }) {
               return a ? null : b ? null : <div />;
             }`,
      errors: [unexpectedNullishRender, unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               return show && null;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               return show || null;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ value }: { value: string | null }) {
               return value ?? null;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               return (show && undefined) || <div />;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp() { return null as any; }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp() { return null!; }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp() { return null satisfies null; }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp() { return (null as any)!; }`,
      errors: [unexpectedNullishRender],
    },
    {
      filename: "file.ts",
      code: `function Comp() { return <any>null; }`,
      errors: [unexpectedNullishRender],
    },
    {
      filename: "file.ts",
      code: `const Comp = () => <any>null;`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               const content = show ? <div /> : null;
               return content;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp() {
               const nothing = null;
               const result = nothing;
               return result;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               const nothing = null;
               return show ? <div /> : nothing;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               const missing = undefined;
               const result = missing;
               return (show && result) || <div />;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp() {
               const boxed = null as any;
               return boxed;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `const Comp = memo(() => null);`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `const Comp = React.memo(() => null);`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `const Comp = forwardRef(() => null);`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `const Comp = React.forwardRef(() => null);`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `const Comp = memo(forwardRef(() => null));`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `export default function () { return null; }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `export default () => null;`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp() {
               try {
                 return <div />;
               } catch {
                 return null;
               }
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ kind }: { kind: "a" | "b" }) {
               switch (kind) {
                 case "a":
                   return <div />;
                 default:
                   return null;
               }
             }`,
      errors: [unexpectedNullishRender],
    },
  ],
});
