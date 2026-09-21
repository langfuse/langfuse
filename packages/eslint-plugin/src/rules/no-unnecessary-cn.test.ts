import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-unnecessary-cn.js";

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

const options = [{ importPath: "@/src/utils/tailwind" }] as const;

ruleTester.run("no-unnecessary-cn", rule, {
  valid: [
    {
      code: `import { cn } from "@/src/utils/tailwind";
             const className = cn("flex", props.className);`,
      options,
    },
    {
      code: `import { cn } from "@/src/utils/tailwind";
             const className = cn(condition && "flex");`,
      options,
    },
    {
      code: `import { cn } from "@/src/utils/tailwind";
             const className = cn(classes);`,
      options,
    },
    {
      code: 'import { cn } from "@/src/utils/tailwind";\nconst className = cn(`flex ${size}`);',
      options,
    },
    {
      code: `import { cn } from "./other";
             const className = cn("flex");`,
      options,
    },
    {
      code: `import * as tailwind from "@/src/utils/tailwind";
             const className = tailwind.cn("flex");`,
      options,
    },
    {
      code: `function cn(value: string) { return value; }
             const className = cn("flex");`,
      options,
    },
    {
      code: `import { cn } from "@/src/utils/tailwind";
             const className = cn(1);`,
      options,
    },
    {
      code: `import { cn } from "@/src/utils/tailwind";
             function getClassName(cn: (value: string) => string) {
               return cn("flex");
             }`,
      options,
    },
    {
      code: `import { cn } from "@/src/utils/tailwind";
             {
               const cn = (value: string) => value;
               const className = cn("flex");
             }`,
      options,
    },
    {
      code: `import { cn } from "@/src/utils/tailwind";
             {
               const className = cn("flex", "gap-2");
             }`,
      options,
    },
  ],
  invalid: [
    {
      code: `import { cn } from "@/src/utils/tailwind";
             const className = cn("flex");`,
      output: `import { cn } from "@/src/utils/tailwind";
             const className = "flex";`,
      options,
      errors: [{ messageId: "unnecessaryCn" }],
    },
    {
      code: `import { cn } from "@/src/utils/tailwind";
             const element = <div className={cn("flex")} />;`,
      output: `import { cn } from "@/src/utils/tailwind";
             const element = <div className="flex" />;`,
      options,
      errors: [{ messageId: "unnecessaryCn" }],
    },
    {
      code: 'import { cn } from "@/src/utils/tailwind";\nconst element = <div className={cn(`flex`)} />;',
      output:
        'import { cn } from "@/src/utils/tailwind";\nconst element = <div className="flex" />;',
      options,
      errors: [{ messageId: "unnecessaryCn" }],
    },
    {
      code: `import { cn as cx } from "@/src/utils/tailwind";
             const className = cx("flex");`,
      output: `import { cn as cx } from "@/src/utils/tailwind";
             const className = "flex";`,
      options,
      errors: [{ messageId: "unnecessaryCn" }],
    },
    {
      code: 'import { cn } from "@/src/utils/tailwind";\nconst className = cn(`flex`);',
      output:
        'import { cn } from "@/src/utils/tailwind";\nconst className = `flex`;',
      options,
      errors: [{ messageId: "unnecessaryCn" }],
    },
  ],
});
