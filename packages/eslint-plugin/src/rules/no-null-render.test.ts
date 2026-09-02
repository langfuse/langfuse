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
    `function AdminOnly({ children }: { children: React.ReactNode }) {
       const canManage = true;
       if (!canManage) return null;
       return <>{children}</>;
     }`,
    `function ClientPortal({ children }: { children: React.ReactNode }) {
       const target = document.body;
       if (!target) return null;
       return createPortal(children, target);
     }`,
    `function Layer({ children, container }: { children: React.ReactNode; container: HTMLElement | null }) {
       return container ? createPortal(children, container) : null;
     }`,
    `function Portal({ children, el }: { children: React.ReactNode; el: HTMLElement }) {
       return ReactDOM.createPortal(<>{children}</>, el);
     }`,
    `function Gate({ children, show }: { children: React.ReactNode; show: boolean }) {
       return show ? children : null;
     }`,
    `function Gate({ children, show }: { children: React.ReactNode; show: boolean }) {
       return show && children;
     }`,
    `function Gate({ children, value }: { children: React.ReactNode; value: React.ReactNode | null }) {
       return children ?? null;
     }`,
    `function Gate({ children, value }: { children: React.ReactNode; value: React.ReactNode | null }) {
       return children || null;
     }`,
    `function Dismiss({ children, show }: { children: (props: { onDismiss: () => void }) => React.ReactNode; show: boolean }) {
       if (!show) return null;
       return children({ onDismiss: () => undefined });
     }`,
    `function Slot(props: { children: React.ReactNode; show: boolean }) {
       if (!props.show) return null;
       return props.children;
     }`,
    `function Slot(props: { children: React.ReactNode; show: boolean }) {
       if (!props.show) return null;
       return props?.children;
     }`,
    `function RenderProp({ children, show }: { children: () => React.ReactNode; show: boolean }) {
       if (!show) return null;
       return children?.();
     }`,
    `function Frag({ children, show }: { children: React.ReactNode; show: boolean }) {
       if (!show) return null;
       return <React.Fragment>{children}</React.Fragment>;
     }`,
    `function Frag({ children, show }: { children: React.ReactNode; show: boolean }) {
       if (!show) return null;
       return <Fragment>{/* mount */}{children}</Fragment>;
     }`,
    `function Nested({ children, show }: { children: React.ReactNode; show: boolean }) {
       if (!show) return null;
       return <><>{children}</></>;
     }`,
    `function Alias({ children, show }: { children: React.ReactNode; show: boolean }) {
       const out = children as React.ReactNode;
       if (!show) return null;
       return out;
     }`,
    `const Gate = memo(({ children, show }: { children: React.ReactNode; show: boolean }) =>
       show ? children : null);`,
    `const Gate = ({ children, show }: { children: React.ReactNode; show: boolean }) =>
       show ? children : undefined;`,
    `function SwitchGate({ children, kind }: { children: React.ReactNode; kind: "a" | "b" }) {
       switch (kind) {
         case "a":
           return children;
         default:
           return null;
       }
     }`,
    `function TryGate({ children }: { children: React.ReactNode }) {
       try {
         return children;
       } catch {
         return null;
       }
     }`,
    `function List({ children, show }: { children: React.ReactNode; show: boolean }) {
       if (!show) return null;
       return [children];
     }`,
    `function NestedAnd({ children, show, flag }: { children: React.ReactNode; show: boolean; flag: boolean }) {
       if (!show) return null;
       return (flag && children) && children;
     }`,
    `function NestedCond({ children, show, flag }: { children: React.ReactNode; show: boolean; flag: boolean }) {
       if (!show) return null;
       return (flag ? children : null) && children;
     }`,
    `function ArrayAnd({ children, show }: { children: React.ReactNode; show: boolean }) {
       if (!show) return null;
       return [children] && children;
     }`,
    `function SpreadAnd({ children, show, items }: { children: React.ReactNode; show: boolean; items: React.ReactNode[] }) {
       if (!show) return null;
       return [...items] && children;
     }`,
    `function PortalAnd({ children, show, el }: { children: React.ReactNode; show: boolean; el: HTMLElement }) {
       if (!show) return null;
       return createPortal(children, el) && children;
     }`,
    `function FragAnd({ children, show }: { children: React.ReactNode; show: boolean }) {
       if (!show) return null;
       return <>{children}</> && children;
     }`,
    `function OptionalPortal({ children, el }: { children: React.ReactNode; el: HTMLElement }) {
       return el ? createPortal?.(children, el) : null;
     }`,
    `function WhitespaceFrag({ children, show }: { children: React.ReactNode; show: boolean }) {
       if (!show) return null;
       return (
         <>
           {children}
         </>
       );
     }`,
    `function RenderPropAnd({ children, show }: { children: () => React.ReactNode; show: boolean }) {
       if (!show) return null;
       return children() && children();
     }`,
  ],
  invalid: [
    {
      code: `function Comp() { return <></>; }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `const Comp = () => <React.Fragment></React.Fragment>;`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp() {
               return (
                 <>
                   {/* intentionally empty */}
                 </>
               );
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               return show ? <div /> : <React.Fragment />;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp() { return false; }`,
      errors: [unexpectedNullishRender],
    },
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
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return <div>{children}</div>;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return <Provider>{children}</Provider>;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, container }: { children: React.ReactNode; container: HTMLElement | null }) {
               return container ? createPortal(<div>{children}</div>, container) : null;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return <><span />{children}</>;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return <>hello{children}</>;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ show }: { show: boolean }) {
               if (!show) return null;
               return <></>;
             }`,
      errors: [unexpectedNullishRender, unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return <svg:g>{children}</svg:g>;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return <Foo.Bar>{children}</Foo.Bar>;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return <foo.Fragment>{children}</foo.Fragment>;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ item, show }: { item: { children: React.ReactNode }; show: boolean }) {
               if (!show) return null;
               return item.children;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return createPortal();
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show, args }: { children: React.ReactNode; show: boolean; args: unknown[] }) {
               if (!show) return null;
               return createPortal(...args);
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return foo(children);
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show, obj }: { children: React.ReactNode; show: boolean; obj: Record<string, Function> }) {
               if (!show) return null;
               return obj["createPortal"](children);
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show, rest }: { children: React.ReactNode; show: boolean; rest: React.ReactNode[] }) {
               if (!show) return null;
               return [children, ...rest];
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return [, children];
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return <>{...children}</>;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return children && extra;
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show }: { children: React.ReactNode; show: boolean }) {
               if (!show) return null;
               return props["children"];
             }`,
      errors: [unexpectedNullishRender],
    },
    {
      code: `function Comp({ children, show, flag }: { children: React.ReactNode; show: boolean; flag: boolean }) {
               if (!show) return null;
               return (flag ? extra : children) && children;
             }`,
      errors: [unexpectedNullishRender],
    },
  ],
});
