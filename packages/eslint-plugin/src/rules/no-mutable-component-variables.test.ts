import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-mutable-component-variables.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const useConst = { messageId: "useConst" as const };

ruleTester.run("no-mutable-component-variables", rule, {
  valid: [
    `function Card() { const label = x ? "a" : "b"; return <div>{label}</div>; }`,
    `function calculate() { let label; if (x) label = "a"; else label = "b"; return label; }`,
    `function useCard() { let count = 0; for (const item of items) count++; return count; }`,
    `export default function () { let label = "a"; return <div>{label}</div>; }`,
    `function Card() { const onClick = () => { let count = 0; count++; }; return <button onClick={onClick} />; }`,
    `function Card() { const label = useMemo(() => { let value = "a"; if (x) value = "b"; return value; }, [x]); return <div>{label}</div>; }`,
    `function Card() { const label = (() => { let value = "a"; if (x) value = "b"; return value; })(); return <div>{label}</div>; }`,
    `function Card() { function helper() { let value = "a"; return value; } return <div>{helper()}</div>; }`,
    `const card = () => { let label = "a"; return label; };`,
    `const { Card } = module;`,
    `let outside = 0; function Card() { return <div>{outside}</div>; }`,
    `function Card() { const label = "a"; return <div>{label}</div>; }`,
    `const Card = notAWrapper(() => { let label = "a"; return <div>{label}</div>; });`,
    `const Card = memo();`,
    `const Card = memo(...fns);`,
    `const Card = memo(existing);`,
    `const Card = obj["memo"](() => { let label = "a"; return <div>{label}</div>; });`,
    `const Card = obj.notMemo(() => { let label = "a"; return <div>{label}</div>; });`,
    `const Card = (0, memo)(() => { let label = "a"; return <div>{label}</div>; });`,
    `class Holder { #memo() { return () => null; } } const Card = new Holder().#memo(() => { let label = "a"; return <div>{label}</div>; });`,
    `const Card = null;`,
    `let Card;`,
  ],
  invalid: [
    {
      code: `function Card() { let label; if (x) label = "a"; else label = "b"; return <div>{label}</div>; }`,
      errors: [useConst],
    },
    {
      code: `function Card() { let count = 0; for (const item of items) count++; return <div>{count}</div>; }`,
      errors: [useConst],
    },
    {
      code: `function Card() { var label = x ? "a" : "b"; return <div>{label}</div>; }`,
      errors: [useConst],
    },
    {
      code: `function Card() { if (x) { let label = "a"; consume(label); } return <div />; }`,
      errors: [useConst],
    },
    {
      code: `function Card() { for (let index = 0; index < items.length; index++) { consume(items[index]); } return <div />; }`,
      errors: [useConst],
    },
    {
      code: `function Card() { switch (x) { case 1: { let label = "a"; consume(label); break; } } return <div />; }`,
      errors: [useConst],
    },
    {
      code: `const Card = () => { let label = "a"; return <div>{label}</div>; };`,
      errors: [useConst],
    },
    {
      code: `const Card = function () { let label = "a"; return <div>{label}</div>; };`,
      errors: [useConst],
    },
    {
      code: `const Card = memo(() => { let label = "a"; return <div />; });`,
      errors: [useConst],
    },
    {
      code: `const Card = forwardRef(function (props, ref) { let label = "a"; return <div />; });`,
      errors: [useConst],
    },
    {
      code: `const Card = React.memo(React.forwardRef((props, ref) => { let label = "a"; return <div />; }));`,
      errors: [useConst],
    },
    {
      code: `const Card = memo(() => { let label = "a"; return <div />; }) as React.FC;`,
      errors: [useConst],
    },
    {
      code: `const Card = memo(() => { let label = "a"; return <div />; }) satisfies React.FC;`,
      errors: [useConst],
    },
    {
      code: `const Card = memo(() => { let label = "a"; return <div />; })!;`,
      errors: [useConst],
    },
    {
      code: `function Card() { let label = "a"; var count = 0; return <div />; }`,
      errors: [useConst, useConst],
    },
    {
      code: `function Card() { function Child() { let label = "a"; return <span />; } return <Child />; }`,
      errors: [useConst],
    },
  ],
});
