import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-let-assign-in-react.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("no-let-assign-in-react", rule, {
  valid: [
    `function Card() { let x = 0; return <div>{x}</div>; }`,
    `function calculate() { let x = 0; x = 1; return x; }`,
    `function Card() { const x = useMemo(() => { let value = 0; if (condition) value = 1; return value; }, [condition]); return <div>{x}</div>; }`,
    `function Card() { let x = 0; const click = () => { x++; }; useEffect(() => { x = 1; }, []); return <button onClick={click}>{x}</button>; }`,
    `function Card() { let x = 0; function helper() { x = 1; let y = 0; y++; } return <div>{x}</div>; }`,
    `function Card() { const x = {}; x.value = 1; return <div />; }`,
    `function Card() { let x = {}; x.value = 1; return <div />; }`,
    `let x = 0; function Card() { x = 1; return <div />; }`,
    `function Card(x) { x = 1; return <div />; }`,
    `function Card() { var x = 0; x = 1; return <div />; }`,
    `function Card() { let x = 0; { const x = {}; x.value = 1; } return <div>{x}</div>; }`,
    `function Card() { for (let x of values) { consume(x); } return <div />; }`,
    `function Card() { for (let x = 0; x < 3; x++) {} return <div />; }`,
    `function Card() { for (let x = 3; x > 0; --x) {} return <div />; }`,
    `function Card() { for (let x = 0; x < 3; x += 2) {} return <div />; }`,
    `function Card() { for (let x = 0; x < 3; x = x + 1) {} return <div />; }`,
    `function Card() { for (let x = 0, y = 3; x < y; x++, y--) {} return <div />; }`,
  ],
  invalid: [
    ...[
      `function Card() { let x; if (condition) x = 1; return <div>{x}</div>; }`,
      `function Card() { let x = 0; x = 1; return <div>{x}</div>; }`,
      `const Card = () => { let x = 0; x += 1; return <div>{x}</div>; };`,
      `const Card = function () { let x = 0; x++; return <div>{x}</div>; };`,
      `export default function () { let x = 0; --x; return <div>{x}</div>; }`,
      `const Card = memo(() => { let x = 0; x ||= 1; return <div />; });`,
      `const Card = React.forwardRef(() => { let x = 0; x ??= 1; return <div />; });`,
      `const Card = (() => { let x = 0; x &&= 1; return <div />; }) satisfies React.FC;`,
      `function Card() { if (condition) { let x = 0; x = 1; } return <div />; }`,
      `function Card() { let x = 0; { x = 1; } return <div />; }`,
      `function Card() { let { x } = props; ({ x } = other); return <div />; }`,
      `function Card() { let [x] = values; [x] = other; return <div />; }`,
      `function Card() { for (let x = 0; x < 3; x++) { x = 1; } return <div />; }`,
      `function Card() { let x = 0; for (let i = 0; i < 3; i++, x++) {} return <div />; }`,
      `function Card() { let x = 0; for (; x < 3; x++) {} return <div />; }`,
      `function Card() { let x = 0; for (let i = 0; i < 3; i++) { x += i; } return <div />; }`,
      `function Card() { let x; for (x of values) {} return <div />; }`,
      `function Card() { let x = 0; return <div>{x = 1}</div>; }`,
      `function Card() { let x = 0; x = 1; return null; }`,
      `export default memo(() => { let x = 0; x = 1; return <div />; });`,
      `function Card() { let x = 0; x = 1; const view = <div />; return view; }`,
    ].map((code) => ({
      code,
      errors: [
        { messageId: "unexpectedReassignment" as const, data: { name: "x" } },
      ],
    })),
    {
      code: `function Card() { let x = 0; if (condition) x = 1; else x = 2; return <div />; }`,
      errors: [
        { messageId: "unexpectedReassignment", data: { name: "x" } },
        { messageId: "unexpectedReassignment", data: { name: "x" } },
      ],
    },
    {
      code: `function Card() { let x = 0; { let x = 1; x++; } x++; return <div />; }`,
      errors: [
        { messageId: "unexpectedReassignment", data: { name: "x" } },
        { messageId: "unexpectedReassignment", data: { name: "x" } },
      ],
    },
    {
      code: `function Card() { function Child() { let x = 0; x++; return <span />; } return <Child />; }`,
      errors: [{ messageId: "unexpectedReassignment", data: { name: "x" } }],
    },
  ],
});
