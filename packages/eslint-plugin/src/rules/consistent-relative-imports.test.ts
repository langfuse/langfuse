import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";

import rule from "./consistent-relative-imports.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
});

const options = [
  {
    alias: "@/src",
    directoryModuleRoots: ["features"],
    fileModuleRoots: ["components"],
    importRoots: ["*", "components/*", "features/*"],
  },
] as const;

ruleTester.run("consistent-relative-imports", rule, {
  valid: [
    {
      code: `import { Button } from "@/src/components/forms/Button";`,
      filename: "/repo/web/generated/Input.tsx",
      options,
    },
    {
      code: `import { Input } from "./Input";`,
      filename: "/repo/web/src/components/forms/Input.tsx",
      options,
    },
    {
      code: `import { Button } from "./Button";`,
      filename: "/repo/web/src/components/forms/Input.tsx",
      options,
    },
    {
      code: `import { Button } from "@/src/components/buttons/Button";`,
      filename: "/repo/web/src/components/forms/Input.tsx",
      options,
    },
    {
      code: `import { useProject } from "@/src/features/projects/hooks";`,
      filename: "/repo/web/src/components/forms/Input.tsx",
      options,
    },
    {
      code: `import React from "react";`,
      filename: "/repo/web/src/components/forms/Input.tsx",
      options,
    },
    {
      code: `import preview from "../../../../.storybook/preview";`,
      filename: "/repo/web/src/components/forms/Input.stories.tsx",
      options,
    },
    {
      code: `import { TestRunDetails } from "./TestRunDetails";`,
      filename:
        "/repo/web/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestRunCard/TestRunCard.tsx",
      options,
    },
    {
      code: `import { Button } from "@/src/components/ui/button";`,
      filename: "/repo/web/src/components/ModelParameters/index.tsx",
      options,
    },
    {
      code: `import { InputControl } from "../internal/InputControl/InputControl";`,
      filename: "/repo/web/src/components/design-system/Input/Input.tsx",
      options,
    },
    {
      code: `export const Button = 1;`,
      filename: "/repo/web/src/components/forms/Input.tsx",
      options,
    },
    {
      code: `import { Input } from "./Input";`,
      filename: "/repo/web/src/components/Input.stories.tsx",
      options: [
        {
          alias: "@/src",
          directoryModuleRoots: [],
          fileModuleRoots: ["components"],
          importRoots: ["features/*"],
        },
      ],
    },
  ],
  invalid: [
    {
      code: `import preview from "@/src/../.storybook/preview";`,
      output: `import preview from "../../../.storybook/preview";`,
      filename: "/repo/web/src/components/forms/Input.stories.tsx",
      options,
      errors: [{ messageId: "useRelative" }],
    },
    {
      code: `import { Input } from "@/src/components/forms/Input/Input";`,
      output: `import { Input } from "./Input";`,
      filename: "/repo/web/src/components/forms/Input/Input.stories.tsx",
      options,
      errors: [{ messageId: "useRelative" }],
    },
    {
      code: `import { Input } from "@/src/components/Input";`,
      output: `import { Input } from "./Input";`,
      filename: "/repo/web/src/components/Input.stories.tsx",
      options,
      errors: [{ messageId: "useRelative" }],
    },
    {
      code: `export { Input } from "@/src/components/Input";`,
      output: `export { Input } from "./Input";`,
      filename: "/repo/web/src/components/Input.stories.ts",
      options,
      errors: [{ messageId: "useRelative" }],
    },
    {
      code: `import { hooks } from "@/src/features/projects/hooks";`,
      output: `import { hooks } from "../hooks";`,
      filename: "/repo/web/src/features/projects/fields/index.ts",
      options,
      errors: [{ messageId: "useRelative" }],
    },
    {
      code: `import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";`,
      output: `import { createTableColumn } from "./utils/createTableColumn";`,
      filename:
        "/repo/web/src/components/design-system/table/columns/createDurationTableColumn.tsx",
      options,
      errors: [{ messageId: "useRelative" }],
    },
    {
      code: `import { InputControl } from "@/src/components/design-system/internal/InputControl/InputControl";`,
      output: `import { InputControl } from "../internal/InputControl/InputControl";`,
      filename: "/repo/web/src/components/design-system/Input/Input.tsx",
      options,
      errors: [{ messageId: "useRelative" }],
    },
    {
      code: `import { Button } from "../ui/button";`,
      output: `import { Button } from "@/src/components/ui/button";`,
      filename: "/repo/web/src/components/ModelParameters/index.tsx",
      options,
      errors: [{ messageId: "useAbsolute" }],
    },
    {
      code: `import { useProject } from "../hooks/useProject";`,
      output: `import { useProject } from "@/src/hooks/useProject";`,
      filename: "/repo/web/src/components/Input.tsx",
      options,
      errors: [{ messageId: "useAbsolute" }],
    },
    {
      code: `import * as hooks from "../hooks";`,
      output: `import * as hooks from "@/src/hooks";`,
      filename: "/repo/web/src/components/Input.tsx",
      options,
      errors: [{ messageId: "useAbsolute" }],
    },
    {
      code: `import { navigationFilters } from "@/src/components/layouts/app-layout/utils/navigationFilters";`,
      output: `import { navigationFilters } from "../utils/navigationFilters";`,
      filename:
        "/repo/web/src/components/layouts/app-layout/hooks/useFilteredNavigation.ts",
      options,
      errors: [{ messageId: "useRelative" }],
    },
    {
      code: `import { useEvaluatorTest } from "@/src/features/evals/v2/components/EvaluatorTestPanel/hooks/useEvaluatorTest";`,
      output: `import { useEvaluatorTest } from "../../../../hooks/useEvaluatorTest";`,
      filename:
        "/repo/web/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestRunCard/TestRunCard.tsx",
      options,
      errors: [{ messageId: "useRelative" }],
    },
    {
      code: `import { useProject } from "../../../../../../../../projects/hooks";`,
      output: `import { useProject } from "@/src/features/projects/hooks";`,
      filename:
        "/repo/web/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestRunCard/TestRunCard.tsx",
      options,
      errors: [{ messageId: "useAbsolute" }],
    },
    {
      code: `export * from "../../buttons/Button";`,
      output: `export * from "@/src/components/buttons/Button";`,
      filename: "/repo/web/src/components/forms/fields/index.ts",
      options,
      errors: [{ messageId: "useAbsolute" }],
    },
    {
      code: `import { useProject } from "../../../hooks/useProject";`,
      output: `import { useProject } from "@/src/hooks/useProject";`,
      filename: "/repo/web/src/components/forms/fields/Input.tsx",
      options,
      errors: [{ messageId: "useAbsolute" }],
    },
  ],
});
