import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";

import rule from "./no-design-system-external-components.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

const designSystemFile =
  "/workspace/web/src/components/design-system/Button/Button.tsx";
const relativeDesignSystemFile =
  "src/components/design-system/Callout/Callout.tsx";
const windowsDesignSystemFile =
  "C:\\repo\\web\\src\\components\\design-system\\SearchInput\\SearchInput.tsx";
const appFile = "/workspace/web/src/features/traces/components/Trace.tsx";

const unexpected = {
  messageId: "unexpected" as const,
};

ruleTester.run("no-design-system-external-components", rule, {
  valid: [
    {
      code: `import { Button } from "@/src/components/ui/button";`,
    },
    {
      filename: appFile,
      code: `import { Button } from "@/src/components/ui/button";
             import TagList from "@/src/features/tag/components/TagList";`,
    },
    {
      filename: designSystemFile,
      code: `import { cn } from "@/src/utils/tailwind";
             import { useIsMac } from "@/src/hooks/useIsMac";
             import { env } from "@/src/env.mjs";
             import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
             import { Badge } from "@/src/components/design-system";
             import { type Variant } from "./types";
             import { Spinner } from "../Spinner/Spinner";
             import { cva } from "class-variance-authority";
             import { Check } from "lucide-react";
             import { type Observation } from "@langfuse/shared";
             export { type Variant };
             export { env as publicEnv } from "@/src/env.mjs";`,
    },
    {
      filename: relativeDesignSystemFile,
      code: `import { X } from "./icons";
             import { copyTextToClipboard } from "../../../utils/clipboard";`,
    },
    {
      filename: designSystemFile,
      code: `const load = (path: string) => import(path);
             const loadTemplate = (name: string) => import(\`./\${name}\`);`,
    },
    {
      filename: designSystemFile,
      code: `import { helper } from "@/foosrc/components/ui/button";
             import { pkg } from "@/pkg";
             import { outside } from "../../../../../../../outside";`,
    },
  ],
  invalid: [
    {
      filename: designSystemFile,
      code: `import { Button } from "@/src/components/ui/button";`,
      errors: [
        { ...unexpected, data: { importPath: "@/src/components/ui/button" } },
      ],
    },
    {
      filename: designSystemFile,
      code: `import type { LangfuseColumnDef } from "@/src/components/table/types";`,
      errors: [
        { ...unexpected, data: { importPath: "@/src/components/table/types" } },
      ],
    },
    {
      filename: designSystemFile,
      code: `import { ItemBadge } from "@/src/components/ItemBadge";`,
      errors: [
        { ...unexpected, data: { importPath: "@/src/components/ItemBadge" } },
      ],
    },
    {
      filename: designSystemFile,
      code: `import * as Components from "@/src/components";`,
      errors: [{ ...unexpected, data: { importPath: "@/src/components" } }],
    },
    {
      filename: designSystemFile,
      code: `import TagList from "@/src/features/tag/components/TagList";`,
      errors: [
        {
          ...unexpected,
          data: { importPath: "@/src/features/tag/components/TagList" },
        },
      ],
    },
    {
      filename: designSystemFile,
      code: `import * as Features from "@/src/features";`,
      errors: [{ ...unexpected, data: { importPath: "@/src/features" } }],
    },
    {
      filename: designSystemFile,
      code: `import { Extra } from "@/src/components/design-system-extra";`,
      errors: [
        {
          ...unexpected,
          data: { importPath: "@/src/components/design-system-extra" },
        },
      ],
    },
    {
      filename: designSystemFile,
      code: `import { Button } from "@/./src/components/ui/button";`,
      errors: [
        { ...unexpected, data: { importPath: "@/./src/components/ui/button" } },
      ],
    },
    {
      filename: relativeDesignSystemFile,
      code: `import { Button } from "../../ui/button";`,
      errors: [{ ...unexpected, data: { importPath: "../../ui/button" } }],
    },
    {
      filename: relativeDesignSystemFile,
      code: `import TagList from "../../../features/tag/components/TagList";`,
      errors: [
        {
          ...unexpected,
          data: { importPath: "../../../features/tag/components/TagList" },
        },
      ],
    },
    {
      filename: windowsDesignSystemFile,
      code: `import { Button } from "../../ui/button";`,
      errors: [{ ...unexpected, data: { importPath: "../../ui/button" } }],
    },
    {
      filename: designSystemFile,
      code: `export { Button } from "@/src/components/ui/button";`,
      errors: [
        { ...unexpected, data: { importPath: "@/src/components/ui/button" } },
      ],
    },
    {
      filename: designSystemFile,
      code: `export * from "@/src/features/tag/components/TagList";`,
      errors: [
        {
          ...unexpected,
          data: { importPath: "@/src/features/tag/components/TagList" },
        },
      ],
    },
    {
      filename: designSystemFile,
      code: `const load = () => import("@/src/components/ui/button");`,
      errors: [
        { ...unexpected, data: { importPath: "@/src/components/ui/button" } },
      ],
    },
    {
      filename: designSystemFile,
      code: "const load = () => import(`@/src/features/tag/components/TagList`);",
      errors: [
        {
          ...unexpected,
          data: { importPath: "@/src/features/tag/components/TagList" },
        },
      ],
    },
  ],
});
