import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-margin-on-root-elements.js";

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

ruleTester.run("no-margin-on-root-elements", rule, {
  valid: [
    `function Card() { return <div className="flex gap-2" />; }`,
    `function Card() { return <div style={{ color: "red" }} />; }`,
    `function Card() { return <div><span className="mt-2" /></div>; }`,
    `function Card() { return <div><span style={{ marginTop: 4 }} /></div>; }`,
    `function Card() { return <><div><span className="mt-2" /></div></>; }`,
    `function Card() { const className = "mt-2"; return <div className={className} />; }`,
    `function Card() { return <div className />; }`,
    `function Card() { return <div className={} />; }`,
    `function Card() { return <div className={styles.root} />; }`,
    `function Card() { return <div className={[styles.root]} />; }`,
    `function Card() { return <div className={cn(styles.root)} />; }`,
    `function Card() { return <div className={cn()} />; }`,
    `function Card() { return <div className={styles.cn("mt-2")} />; }`,
    `function Card() { return <div className={n("mt-2")} />; }`,
    `function Card() { return <div className={cn({ flex: isActive })} />; }`,
    `function Card() { return <div className={cn({ flex: isActive, "gap-2": hasGap })} />; }`,
    `function Card() { return <div className={cn({ [className]: isActive })} />; }`,
    `function Card() { return <div className={cn({ [condition ? "mt-2" : "flex"]: isActive })} />; }`,
    `function Card() { return <div className={cn({ ...styles, flex: isActive })} />; }`,
    `function Card() { return <div className={condition && styles.root} />; }`,
    `function Card() { return <div className={"flex"!} />; }`,
    `function Card() { return <div className={"flex" satisfies string} />; }`,
    `function Card() { return <div className={condition ? "flex" : "gap-2"} />; }`,
    "function Card() { return <div className={`flex ${size}`} />; }",
    `function Card() { return <div className={[, "flex"]} />; }`,
    `function Card() { return <>text</>; }`,
    `function Card() { if (open) return <div className="flex" />; return; }`,
    `function Card({ value }: { value: string }) { switch (value) { default: return 1; } }`,
    `function Card() { return 1; }`,
    `function renderCard() { return <div className="mt-2" />; }`,
    `const card = () => <div className="mt-2" />;`,
    `const Card = () => null;`,
    `const Card = () => maybe();`,
    `const Card = () => render(1);`,
    `const Card = () => render(<div className="mt-2" />);`,
    `let Card;`,
    `const [Card] = [() => <div className="mt-2" />];`,
    `const Card = hoc;`,
    `const Card = React.createElement("div", { className: "mt-2" });`,
    `class Card extends React.Component { render() { return <div className="mt-2" />; } }`,
    `const Card = () => <div className="m" />;`,
    `const Card = () => <div className="max-w-md" />;`,
    `const Card = () => <div className="m-0 mt-0 -mx-0 md:!mb-0" />;`,
    `const Card = () => <div className="mt-[0] mb-[0px] mx-[0rem]" />;`,
    `const Card = () => <div {...props} />;`,
    `const Card = () => <div foo:bar="mt-2" />;`,
    `const Card = () => <div className=<span /> />;`,
    `const Card = () => <div style={styles.root} />;`,
    `const Card = () => <div style />;`,
    'const Card = () => <div style={{ margin: 0, marginTop: "0", marginBottom: "0px", marginInline: `0rem` }} />;',
    `const Card = () => <div style={{ [marginProp]: 4 }} />;`,
    `const Card = () => <div style={{ ...styles.root }} />;`,
    "const Card = () => <div style={{ [`marginTop`]: 4 }} />;",
  ],
  invalid: [
    {
      code: `function Card() { return <div className="mt-2" />; }`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `export default function () { return <div className="mt-2" />; }`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className="m-2" />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "m-2" } }],
    },
    {
      code: `const Card = () => <div className="-mx-2" />;`,
      errors: [
        { messageId: "unexpectedClassName", data: { utility: "-mx-2" } },
      ],
    },
    {
      code: `const Card = () => <div className="md:!mt-[12px]" />;`,
      errors: [
        { messageId: "unexpectedClassName", data: { utility: "mt-[12px]" } },
      ],
    },
    {
      code: `const Card = () => <div className="hover:-me-4" />;`,
      errors: [
        { messageId: "unexpectedClassName", data: { utility: "-me-4" } },
      ],
    },
    {
      code: `const Card = () => <div className="empty:m-0.5" />;`,
      errors: [
        { messageId: "unexpectedClassName", data: { utility: "m-0.5" } },
      ],
    },
    {
      code: `const Card = () => <div className={\`flex mb-2\`} />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mb-2" } }],
    },
    {
      code: `const Card = () => <div className={cn("flex", condition && "mt-2")} />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className={clsx("flex", condition && "mt-2")} />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className={cn({ "mt-2": isActive })} />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: "const Card = () => <div className={cn({ [`mt-2`]: isActive })} />;",
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className={n("flex", condition && "mt-2")} />;`,
      options: [{ classNameFunctions: ["cn", "clsx", "n"] }],
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className={cx("flex", condition && "mt-2")} />;`,
      options: [{ classNameFunctions: ["cx"] }],
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className={["flex", "mt-2"]} />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className={condition ? "mt-2" : "flex"} />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className={("mt-2" as string)} />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className={("mt-2"!)} />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className={("mt-2" satisfies string)} />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => condition ? <div className="mt-2" /> : <span />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => condition ? 1 : <div className="mt-2" />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => condition && <div className="mt-2" />;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <><div className="mt-2" /><span /></>;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <><><div className="mt-2" /></></>;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <>{condition && <div className="mt-2" />}</>;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <>{condition ? <div className="mt-2" /> : <span />}</>;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => (<div className="mt-2" />)!;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className="mt-2" /> satisfies React.ReactNode;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = () => <div className="mt-2" /> as React.ReactNode;`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `function Card({ open }: { open: boolean }) { if (open) return <div className="mt-2" />; return null; }`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `function Card({ open }: { open: boolean }) { if (open) return <div className="mt-2" />; }`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `function Card({ value }: { value: string }) { switch (value) { case "a": return <div className="mt-2" />; default: return null; } }`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `function Card() { try { return <div className="mt-2" />; } catch { return null; } }`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `function Card() { try { return 1; } catch { return <div className="mt-2" />; } }`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `function Card() { try { return 1; } finally { return <div className="mt-2" />; } }`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = memo(() => <div className="mt-2" />);`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `const Card = forwardRef<HTMLDivElement, Props>(() => <div className="mt-2" />);`,
      errors: [{ messageId: "unexpectedClassName", data: { utility: "mt-2" } }],
    },
    {
      code: `function Card() { return <div style={{ marginTop: 4 }} />; }`,
      errors: [
        {
          messageId: "unexpectedStyle",
          data: { propertyName: "marginTop" },
        },
      ],
    },
    {
      code: `function Card() { return <div style={{ "margin-block-start": 4, marginInline: 8 }} />; }`,
      errors: [
        {
          messageId: "unexpectedStyle",
          data: { propertyName: "margin-block-start" },
        },
        {
          messageId: "unexpectedStyle",
          data: { propertyName: "marginInline" },
        },
      ],
    },
    {
      code: `function Card() { return <div style={{ margin: 4, marginBottom: 8 }} />; }`,
      errors: [
        { messageId: "unexpectedStyle", data: { propertyName: "margin" } },
        {
          messageId: "unexpectedStyle",
          data: { propertyName: "marginBottom" },
        },
      ],
    },
  ],
});
