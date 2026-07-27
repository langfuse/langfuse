import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./require-title-with-truncate.js";

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

ruleTester.run("require-title-with-truncate", rule, {
  valid: [
    `const Card = ({ value }: { value: string }) => <div className="truncate" title={value}>{value}</div>;`,
    `function Card({ value }: { value: string }) { return <div className="truncate" title={value}>{value}</div>; }`,
    `const Card = () => <div className="truncate" title="Full value" />;`,
    `const Card = () => <div title="Full value" className="truncate" />;`,
    `const Card = () => <div data-state="open" className="truncate" title="Full value" />;`,
    `const Card = () => <div className="text-sm" />;`,
    `const Card = ({ value }: { value: string }) => <div className={cn("truncate", "text-sm")} title={value} />;`,
    `function Card({ value }: { value: string }) { return <div className={cn("truncate", "text-sm")} title={value} />; }`,
    `const Card = ({ value }: { value: string }) => <div className={clsx({ truncate: true })} title={value} />;`,
    `const Card = ({ value }: { value: string }) => <div className={clsx({ ...styles, truncate: true })} title={value} />;`,
    `const Card = ({ value }: { value: string }) => <div className={condition ? "truncate" : "text-sm"} title={value} />;`,
    `const Card = (props: JSX.IntrinsicElements["div"]) => <div {...props} className="text-sm" />;`,
    `const Card = () => <div className={styles("truncate")} />;`,
    `const Card = ({ value }: { value: string }) => <div className={styles.truncate} />;`,
    `const Card = () => <div className={title ? "text-sm" : "font-medium"} />;`,
    `const Card = () => <div className title={null} />;`,
  ],
  invalid: [
    {
      code: `const Card = () => <div className="truncate" />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `function Card() { return <div className="truncate" />; }`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className="md:truncate text-sm" />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className={cn("truncate", "text-sm")} />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `function Card() { return <div className={cn("truncate", "text-sm")} />; }`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className={clsx({ truncate: isVisible })} />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className={clsx({ ...styles, truncate: isVisible })} />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className={["text-sm", "truncate"]} />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className={condition ? "truncate" : "text-sm"} />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className={condition && "truncate"} />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className={"truncate" as string} />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className={"truncate"!} />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className={"truncate" satisfies string} />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className="truncate" title={null} />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div foo:bar="baz" className="truncate" />;`,
      errors: [{ messageId: "missingTitle" }],
    },
    {
      code: `const Card = () => <div className="truncate" title />;`,
      errors: [{ messageId: "missingTitle" }],
    },
  ],
});
