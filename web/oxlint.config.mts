import baseConfig from "@repo/oxlint-config/next";
import { globSync } from "node:fs";
import { defineConfig } from "oxlint";
export default defineConfig({
  ...baseConfig,
  ignorePatterns: [
    "**/storybook-static/",
    "**/.next/",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "**/node_modules/",
    "**/dist/",
    "**/coverage/",
    "**/generated/",
    "oxlint.config.*",
  ],
  // Oxlint settings are global; consuming rules retain their original file scopes.
  settings: {
    react: { version: "19.2.4" },
    "import/resolver": { typescript: { project: "./tsconfig.json" } },
    clientTestStoryFiles: [
      ...globSync("src/**/*.stories.{ts,tsx}", { cwd: import.meta.dirname }),
    ].sort(),
    tailwindcss: { cssConfigPath: "src/styles/globals.css" },
    "boundaries/files": [
      { category: "design-system", pattern: "src/components/design-system/**" },
      { category: "app-component", pattern: "src/components/**" },
      { category: "feature", pattern: "src/features/**" },
    ],
  },
  overrides: [
    ...baseConfig.overrides,
    {
      files: [
        "**/*.clienttest.ts",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/__tests__/**/*.ts",
      ],
      rules: {
        "react/static-components": "off",
      },
    },
    {
      files: [
        "**/*.stories.{ts,tsx,js,jsx,mjs,cjs}",
        "**/*.story.{ts,tsx,js,jsx,mjs,cjs}",
      ],
      jsPlugins: ["eslint-plugin-storybook"],
      rules: {
        "react/rules-of-hooks": "off",
        "storybook/await-interactions": "warn",
        "storybook/context-in-play-function": "warn",
        "storybook/default-exports": "warn",
        "storybook/hierarchy-separator": "warn",
        "storybook/no-redundant-story-name": "warn",
        "storybook/no-renderer-packages": "warn",
        "storybook/prefer-pascal-case": "warn",
        "storybook/story-exports": "warn",
        "storybook/use-storybook-expect": "warn",
        "storybook/use-storybook-testing-library": "warn",
      },
    },
    {
      files: [".storybook/main.{js,cjs,mjs,ts}"],
      jsPlugins: ["eslint-plugin-storybook"],
      rules: {
        "storybook/no-uninstalled-addons": "warn",
      },
    },
    {
      files: ["src/**/*.stories.{ts,tsx}"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/storybook-play-requires-test-name": "warn",
        "@repo/storybook-play-no-implementation-detail-assertions": "warn",
      },
    },
    {
      files: ["src/**/*.{ts,tsx}"],
      excludeFiles: [
        "src/**/*.clienttest.{ts,tsx}",
        "src/**/*.servertest.{ts,tsx}",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.story.{ts,tsx}",
        "src/**/*.stories.{ts,tsx}",
      ],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-abstracted-overlay-trigger": [
          "warn",
          {
            overlayFamilies: [
              {
                module: "@/src/components/ui/dialog",
                root: "Dialog",
                trigger: "DialogTrigger",
                contents: ["DialogContent"],
              },
              {
                module: "@/src/components/ui/alert-dialog",
                root: "AlertDialog",
                trigger: "AlertDialogTrigger",
                contents: ["AlertDialogContent"],
              },
              {
                module: "@/src/components/ui/dropdown-menu",
                root: "DropdownMenu",
                trigger: "DropdownMenuTrigger",
                contents: ["DropdownMenuContent", "DropdownMenuSubContent"],
              },
              {
                module: "@/src/components/ui/drawer",
                root: "Drawer",
                trigger: "DrawerTrigger",
                contents: ["DrawerContent"],
              },
              {
                module: "@/src/components/ui/popover",
                root: "Popover",
                trigger: "PopoverTrigger",
                contents: ["PopoverContent"],
              },
              {
                module: "@/src/components/ui/sheet",
                root: "Sheet",
                trigger: "SheetTrigger",
                contents: ["SheetContent"],
              },
            ],
            overlayControllerFamilies: [
              {
                module:
                  "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController",
                root: "ConfirmationDialogController",
              },
              {
                module:
                  "@/src/components/design-system/DialogController/DialogController",
                root: "DialogController",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "**/*.ts",
        "**/*.tsx",
        "**/*.js",
        "**/*.jsx",
        "**/*.svelte",
        "**/*.vue",
      ],
      excludeFiles: [
        ".storybook/**/*",
        "src/**/__tests__/**",
        "src/**/__e2e__/**",
        "src/**/*.clienttest.{ts,tsx}",
        "src/**/*.servertest.{ts,tsx}",
      ],
      jsPlugins: ["eslint-plugin-tailwindcss"],
      rules: {
        "tailwindcss/classnames-order": "off",
        "tailwindcss/enforces-canonical-classname": "off",
        "tailwindcss/enforces-negative-arbitrary-values": "warn",
        "tailwindcss/enforces-shorthand": "off",
        "tailwindcss/important-modifier-suffix": "warn",
        "tailwindcss/no-arbitrary-value": "off",
        "tailwindcss/no-custom-classname": [
          "warn",
          {
            whitelist: [
              "io-message-header",
              "io-message-content",
              "ph-no-capture",
              "codeblock",
              "toaster",
              "toast",
              "playground-window",
              "layout",
              "drag-handle",
              "peer",
              "peer/menu-button",
              "cmdk-input-wrapper",
              "dialog-header",
              "dialog-footer",
            ],
          },
        ],
        "tailwindcss/no-contradicting-classname": "off",
        "tailwindcss/no-unnecessary-arbitrary-value": "off",
      },
    },
    {
      files: ["src/**/*.{ts,tsx}"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-unnecessary-cn": [
          "warn",
          {
            importPath: "@/src/utils/tailwind",
          },
        ],
      },
    },
    {
      files: ["src/**/*.{ts,tsx}"],
      excludeFiles: ["src/**/*.stories.{ts,tsx}"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/require-title-with-truncate": [
          "warn",
          {
            classNameFunctions: ["cn", "clsx"],
          },
        ],
      },
    },
    {
      files: ["src/**/*.{ts,tsx}"],
      excludeFiles: [
        "src/__tests__/**",
        "src/__e2e__/**",
        "src/**/*.clienttest.{ts,tsx}",
        "src/**/*.servertest.{ts,tsx}",
        "src/**/*.stories.{ts,tsx}",
        "src/components/layouts/**",
      ],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-null-render": "warn",
      },
    },
    {
      files: ["src/pages/**/*.{ts,tsx}"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-null-render": "off",
      },
    },
    {
      files: ["src/**/*.{ts,tsx}"],
      excludeFiles: [
        "src/__tests__/**",
        "src/__e2e__/**",
        "src/**/*.clienttest.{ts,tsx}",
        "src/**/*.servertest.{ts,tsx}",
      ],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-style-props": "warn",
      },
    },
    {
      files: ["src/components/design-system/**/*.{ts,tsx}"],
      excludeFiles: [
        "src/components/design-system/charts/**",
        "src/components/design-system/factories/**",
        "src/components/design-system/internal/**",
        "src/components/design-system/table/**",
      ],
      jsPlugins: ["eslint-plugin-check-file"],
      rules: {
        "check-file/folder-match-with-fex": [
          "warn",
          {
            "*.{ts,tsx}": "src/components/design-system/*/",
          },
        ],
        "check-file/folder-naming-convention": [
          "warn",
          {
            "src/components/design-system/*/": "PASCAL_CASE",
          },
        ],
        "check-file/filename-naming-convention": [
          "warn",
          {
            "src/components/design-system/*/*.{ts,tsx}": "<0>",
          },
          {
            ignoreMiddleExtensions: true,
          },
        ],
      },
    },
    {
      files: ["**/*.{tsx,jsx}"],
      excludeFiles: [
        "src/pages/**",
        "src/app/**/layout.{tsx,jsx}",
        "src/components/design-system/**/*.stories.{ts,tsx}",
        "**/*.{test,spec,clienttest,servertest}.{tsx,jsx}",
        "**/{__tests__,__e2e__,tests,test}/**",
      ],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/component-file-structure": "warn",
      },
    },
    {
      files: ["src/components/design-system/*/*.{ts,tsx}"],
      excludeFiles: [
        "src/components/design-system/**/*.stories.{ts,tsx}",
        "src/components/design-system/charts/**",
        "src/components/design-system/table/**",
      ],
      rules: {
        "import/no-default-export": "warn",
      },
    },
    {
      files: ["src/components/design-system/**/*.{ts,tsx}"],
      excludeFiles: ["src/components/design-system/**/*.stories.tsx"],
      env: {
        browser: true,
      },
      jsPlugins: [
        "eslint-plugin-react-you-might-not-need-an-effect",
        "eslint-plugin-boundaries",
      ],
      rules: {
        "react-you-might-not-need-an-effect/no-derived-state": "warn",
        "react-you-might-not-need-an-effect/no-chain-state-updates": "warn",
        "react-you-might-not-need-an-effect/no-event-handler": "warn",
        "react-you-might-not-need-an-effect/no-adjust-state-on-prop-change":
          "warn",
        "react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change":
          "warn",
        "react-you-might-not-need-an-effect/no-pass-live-state-to-parent":
          "warn",
        "react-you-might-not-need-an-effect/no-pass-data-to-parent": "warn",
        "react-you-might-not-need-an-effect/no-external-store-subscription":
          "warn",
        "react-you-might-not-need-an-effect/no-initialize-state": "warn",
        "boundaries/dependencies": [
          "warn",
          {
            default: "allow",
            policies: [
              {
                from: {
                  file: {
                    categories: "design-system",
                  },
                },
                disallow: {
                  to: {
                    file: {
                      categories: {
                        anyOf: ["app-component", "feature"],
                        noneOf: ["design-system"],
                      },
                    },
                  },
                },
                message:
                  "Design-system files must not import from the outer `src/components` tree or from `src/features`.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/components/**/*.{ts,tsx}"],
      excludeFiles: ["src/components/**/*.stories.{ts,tsx}"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-margin-on-root-elements": [
          "warn",
          {
            classNameFunctions: ["cn", "clsx"],
          },
        ],
      },
    },
    {
      files: ["src/features/in-app-agent/**/*.{ts,tsx}"],
      env: {
        browser: true,
      },
      jsPlugins: [
        "eslint-plugin-react-you-might-not-need-an-effect",
        "@repo/eslint-plugin",
      ],
      rules: {
        "react-you-might-not-need-an-effect/no-derived-state": "warn",
        "react-you-might-not-need-an-effect/no-chain-state-updates": "warn",
        "react-you-might-not-need-an-effect/no-event-handler": "warn",
        "react-you-might-not-need-an-effect/no-adjust-state-on-prop-change":
          "warn",
        "react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change":
          "warn",
        "react-you-might-not-need-an-effect/no-pass-live-state-to-parent":
          "warn",
        "react-you-might-not-need-an-effect/no-pass-data-to-parent": "warn",
        "react-you-might-not-need-an-effect/no-external-store-subscription":
          "warn",
        "react-you-might-not-need-an-effect/no-initialize-state": "warn",
        "typescript/consistent-type-definitions": ["warn", "type"],
        "typescript/no-confusing-void-expression": "warn",
        "typescript/no-non-null-assertion": "warn",
        "typescript/no-meaningless-void-operator": "warn",
        "typescript/no-invalid-void-type": "warn",
        "typescript/no-unsafe-assignment": "warn",
        "typescript/return-await": ["warn", "in-try-catch"],
        curly: ["warn", "all"],
        "@repo/no-switch-statements": "warn",
      },
    },
    {
      files: ["src/**/*.{ts,tsx}"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-raw-font-weight": "warn",
        "@repo/no-arbitrary-colors": "warn",
      },
    },
    {
      files: ["src/**/*.{ts,tsx}"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-overlay-zindex": [
          "warn",
          {
            mode: "overlay-content",
          },
        ],
      },
    },
    {
      files: [
        "src/components/ui/dialog.tsx",
        "src/components/ui/alert-dialog.tsx",
        "src/components/ui/sheet.tsx",
        "src/components/ui/drawer.tsx",
        "src/components/ui/popover.tsx",
        "src/components/ui/dropdown-menu.tsx",
        "src/components/ui/select.tsx",
        "src/components/design-system/HoverCardController/HoverCardController.tsx",
        "src/components/design-system/ControlledHoverCard/ControlledHoverCard.tsx",
        "src/components/ui/tooltip.tsx",
      ],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-overlay-zindex": [
          "warn",
          {
            mode: "wrapper",
          },
        ],
      },
    },
    {
      files: ["src/__tests__/**", "src/__e2e__/**", "**/*.servertest.ts"],
      rules: {
        "typescript/no-deprecated": "off",
      },
    },
    {
      files: ["**/*"],
      // The native rule also checks dynamic imports, unlike ESLint's original.
      jsPlugins: [
        { name: "eslint-js", specifier: "@repo/oxlint-config/eslint-rules" },
      ],
      rules: {
        "eslint-js/no-restricted-imports": [
          "warn",
          {
            patterns: [
              {
                regex: "^(lucide-react|react-icons)(/|$)",
                message:
                  "Import typed icons from @langfuse/icons, @langfuse/icons/si, or @langfuse/icons/tb instead.",
              },
              {
                regex: "^(\\.\\./)+(packages|ee|worker)/",
                message:
                  "Do not import other workspace packages via relative paths. Use the package entrypoints instead (e.g. @langfuse/shared/src/db, @langfuse/shared/src/server).",
              },
              {
                regex: "^@sentry/nextjs$",
                importNames: ["captureException", "captureMessage"],
                message:
                  "Do not capture directly — route through the reportError seam (@/src/utils/reportError) or a helper that wraps it (captureUnknownError, reportParserWorkerError), so one seam owns error classification. See the reportError doc comment and .agents/skills/sentry-instrumentation/SKILL.md.",
              },
              {
                regex: "^sonner(?:/|$)",
                importNames: ["toast", "default"],
                message:
                  "Use the notifications feature's typed toast helpers. Every toast must declare its static operation and errors/warnings must declare origin and category.",
              },
              {
                regex: "(^|/)design-system/internal(?:/|$)",
                message:
                  "Design-system internals may only be imported by other design-system components.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/components/design-system/**/*.{ts,tsx}"],
      rules: {
        "eslint-js/no-restricted-imports": [
          "warn",
          {
            patterns: [
              {
                regex: "^(lucide-react|react-icons)(/|$)",
                message:
                  "Import typed icons from @langfuse/icons, @langfuse/icons/si, or @langfuse/icons/tb instead.",
              },
              {
                regex: "^(\\.\\./)+(packages|ee|worker)/",
                message:
                  "Do not import other workspace packages via relative paths. Use the package entrypoints instead (e.g. @langfuse/shared/src/db, @langfuse/shared/src/server).",
              },
              {
                regex: "^@sentry/nextjs$",
                importNames: ["captureException", "captureMessage"],
                message:
                  "Do not capture directly — route through the reportError seam (@/src/utils/reportError) or a helper that wraps it (captureUnknownError, reportParserWorkerError), so one seam owns error classification. See the reportError doc comment and .agents/skills/sentry-instrumentation/SKILL.md.",
              },
              {
                regex: "^sonner(?:/|$)",
                importNames: ["toast", "default"],
                message:
                  "Use the notifications feature's typed toast helpers. Every toast must declare its static operation and errors/warnings must declare origin and category.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/components/design-system/internal/**/*.{ts,tsx}"],
      jsPlugins: ["eslint-plugin-check-file"],
      rules: {
        "check-file/folder-naming-convention": [
          "warn",
          {
            "src/components/design-system/*/": "KEBAB_CASE",
            "src/components/design-system/internal/*/": "PASCAL_CASE",
          },
        ],
      },
    },
    {
      files: ["src/components/design-system/internal/charts/**/*.{ts,tsx}"],
      jsPlugins: ["eslint-plugin-check-file"],
      rules: {
        "check-file/folder-naming-convention": [
          "warn",
          {
            "src/components/design-system/*/": "KEBAB_CASE",
            "src/components/design-system/internal/*/": "KEBAB_CASE",
            "src/components/design-system/internal/charts/*/": "PASCAL_CASE",
          },
        ],
      },
    },
    {
      files: ["src/utils/reportError.ts", "instrumentation-client.ts"],
      rules: {
        "eslint-js/no-restricted-imports": [
          "warn",
          {
            patterns: [
              {
                regex: "^(lucide-react|react-icons)(/|$)",
                message:
                  "Import typed icons from @langfuse/icons, @langfuse/icons/si, or @langfuse/icons/tb instead.",
              },
              {
                regex: "^(\\.\\./)+(packages|ee|worker)/",
                message:
                  "Do not import other workspace packages via relative paths. Use the package entrypoints instead (e.g. @langfuse/shared/src/db, @langfuse/shared/src/server).",
              },
              {
                regex: "(^|/)design-system/internal(?:/|$)",
                message:
                  "Design-system internals may only be imported by other design-system components.",
              },
              {
                regex: "^sonner(?:/|$)",
                importNames: ["toast", "default"],
                message:
                  "Use the notifications feature's typed toast helpers. Every toast must declare its static operation and errors/warnings must declare origin and category.",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "src/features/notifications/showErrorToast.tsx",
        "src/features/notifications/showSuccessToast.tsx",
        "src/features/notifications/showToast.tsx",
      ],
      rules: {
        "eslint-js/no-restricted-imports": [
          "warn",
          {
            patterns: [
              {
                regex: "^(lucide-react|react-icons)(/|$)",
                message:
                  "Import typed icons from @langfuse/icons, @langfuse/icons/si, or @langfuse/icons/tb instead.",
              },
              {
                regex: "^(\\.\\./)+(packages|ee|worker)/",
                message:
                  "Do not import other workspace packages via relative paths. Use the package entrypoints instead (e.g. @langfuse/shared/src/db, @langfuse/shared/src/server).",
              },
              {
                regex: "^@sentry/nextjs$",
                importNames: ["captureException", "captureMessage"],
                message:
                  "Do not capture directly — route through the reportError seam (@/src/utils/reportError) or a helper that wraps it (captureUnknownError, reportParserWorkerError), so one seam owns error classification. See the reportError doc comment and .agents/skills/sentry-instrumentation/SKILL.md.",
              },
              {
                regex: "(^|/)design-system/internal(?:/|$)",
                message:
                  "Design-system internals may only be imported by other design-system components.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/**/*.{ts,tsx}"],
      jsPlugins: [
        { name: "eslint-js", specifier: "@repo/oxlint-config/eslint-rules" },
      ],
      rules: {
        "eslint-js/no-restricted-syntax": [
          "warn",
          {
            selector: "ImportExpression[source.value=/^sonner(?:\\/|$)/]",
            message:
              "Use the notifications feature's typed toast helpers. Every toast must declare its static operation and errors/warnings must declare origin and category.",
          },
          {
            selector:
              "CallExpression[callee.name='require'][arguments.0.value=/^sonner(?:\\/|$)/]",
            message:
              "Use the notifications feature's typed toast helpers. Every toast must declare its static operation and errors/warnings must declare origin and category.",
          },
          {
            selector:
              "TSImportEqualsDeclaration[moduleReference.expression.value=/^sonner(?:\\/|$)/]",
            message:
              "Use the notifications feature's typed toast helpers. Every toast must declare its static operation and errors/warnings must declare origin and category.",
          },
        ],
      },
    },
  ],
});
