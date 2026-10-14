import { globalIgnores } from "eslint/config";
import { globSync, readFileSync } from "node:fs";
import boundaries from "eslint-plugin-boundaries";
import checkFile from "eslint-plugin-check-file";
import reactYouMightNotNeedAnEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import storybook from "eslint-plugin-storybook";
import eslintPluginTailwindcss from "eslint-plugin-tailwindcss";

import nextConfig from "@repo/eslint-config/next";

/** @type {{domains: {path: string}[], moves: {from: string, to: string}[]}} */
const sourceStructure = JSON.parse(
  readFileSync(new URL("./source-structure.json", import.meta.url), "utf8"),
);
// Primitives moved beside the design system retain their original rule scopes.
const designSystemFiles = [
  "src/app/design-system/*.{ts,tsx}",
  "src/app/design-system/!(legacy-primitives|animation-primitives)/**/*.{ts,tsx}",
];
const appComponentRoots = sourceStructure.moves
  .filter(
    ({ from }) =>
      from === "src/components" || from.startsWith("src/components/"),
  )
  .map(({ to }) => to);

// Restricted import patterns that apply everywhere. Flat config replaces (not
// merges) a rule that is configured twice, so every block that configures
// no-restricted-imports must spread the full pattern list it wants.
const restrictedImportPatterns = [
  {
    regex: "^react-icons$",
    message:
      "Only react-icons/si and react-icons/tb are allowed. Please use lucide-react for other icons.",
  },
  {
    regex: "^react-icons/(?!si(?:/|$)|tb(?:/|$)).*",
    message:
      "Only react-icons/si and react-icons/tb are allowed. Please use lucide-react for other icons.",
  },
  {
    // Relative paths escaping web/ bypass @langfuse/shared's exports
    // map (which points at dist/) and pull shared *source* into the
    // Next.js typecheck program, where web's next-auth augmentation
    // breaks it — this failed production deploys (PR #15031).
    // Note: only static imports are checked. Dynamic import() is not
    // covered by this rule, which also leaves room for the one
    // legitimate use: tests that need a Vite-transformed source copy
    // of a shared module to observe env mutations (vitest loads the
    // CJS dist through Node's require cache as a second instance —
    // see blob-storage-integration-trpc.servertest.ts).
    regex: "^(\\.\\./)+(packages|ee|worker)/",
    message:
      "Do not import other workspace packages via relative paths. Use the package entrypoints instead (e.g. @langfuse/shared/src/db, @langfuse/shared/src/server).",
  },
];

// One seam owns error capture: raw Sentry capture APIs are restricted to the
// reportError seam (src/app/utils/reportError.ts) so classification (`expected`),
// `area` tagging, and non-Error coercion live in exactly one place. The
// capture contract lives in the seam's doc comment and in
// .agents/skills/sentry-instrumentation/SKILL.md (human-facing version:
// web/OBSERVABILITY.md, landing separately). Exempted files get a dedicated
// config block below without this pattern — never an inline eslint-disable.
const sentryCapturePattern = {
  regex: "^@sentry/nextjs$",
  importNames: ["captureException", "captureMessage"],
  message:
    "Do not capture directly — route through the reportError seam (@/src/app/utils/reportError) or a helper that wraps it (captureUnknownError, reportParserWorkerError), so one seam owns error classification. See the reportError doc comment and .agents/skills/sentry-instrumentation/SKILL.md.",
};

const toastImportPattern = {
  regex: "^sonner(?:/|$)",
  importNames: ["toast", "default"],
  message:
    "Use the notifications feature's typed toast helpers. Every toast must declare its static operation and errors/warnings must declare origin and category.",
};

const designSystemInternalPattern = {
  regex: "(^|/)design-system/internal(?:/|$)",
  message:
    "Design-system internals may only be imported by other design-system components.",
};

// eslint-plugin-tailwindcss types this as Config | ConfigArray, but the
// recommended export is a single flat config object with rules at runtime.
const tailwindcssRecommendedConfig =
  /** @type {import("eslint").Linter.Config} */ (
    eslintPluginTailwindcss.configs.recommended
  );

export default [
  globalIgnores(["**/storybook-static/"]),

  ...nextConfig,
  {
    name: "langfuse/web/client-test-story-cache-key",
    files: ["src/**/*.clienttest.{ts,tsx}"],
    settings: {
      // ESLint caches unchanged client tests; changing the story set must invalidate them.
      clientTestStoryFiles: [
        ...globSync("src/**/*.stories.ts"),
        ...globSync("src/**/*.stories.tsx"),
      ].sort(),
    },
  },
  ...storybook.configs["flat/recommended"],
  {
    name: "langfuse/web/storybook-test-story-names",
    files: ["src/**/*.stories.{ts,tsx}"],
    rules: {
      "@repo/storybook-play-requires-test-name": "error",
    },
  },
  {
    name: "langfuse/web/no-abstracted-overlay-trigger",
    files: ["{src,pages,app}/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*.clienttest.{ts,tsx}",
      "src/**/*.servertest.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
      "src/**/*.story.{ts,tsx}",
      "src/**/*.stories.{ts,tsx}",
    ],
    rules: {
      "@repo/no-abstracted-overlay-trigger": [
        "warn",
        {
          overlayFamilies: [
            {
              module: "@/src/app/design-system/legacy-primitives/dialog",
              root: "Dialog",
              trigger: "DialogTrigger",
              contents: ["DialogContent"],
            },
            {
              module: "@/src/app/design-system/legacy-primitives/alert-dialog",
              root: "AlertDialog",
              trigger: "AlertDialogTrigger",
              contents: ["AlertDialogContent"],
            },
            {
              module: "@/src/app/design-system/legacy-primitives/dropdown-menu",
              root: "DropdownMenu",
              trigger: "DropdownMenuTrigger",
              contents: ["DropdownMenuContent", "DropdownMenuSubContent"],
            },
            {
              module: "@/src/app/design-system/legacy-primitives/drawer",
              root: "Drawer",
              trigger: "DrawerTrigger",
              contents: ["DrawerContent"],
            },
            {
              module: "@/src/app/design-system/legacy-primitives/popover",
              root: "Popover",
              trigger: "PopoverTrigger",
              contents: ["PopoverContent"],
            },
            {
              module: "@/src/app/design-system/legacy-primitives/sheet",
              root: "Sheet",
              trigger: "SheetTrigger",
              contents: ["SheetContent"],
            },
          ],
          overlayControllerFamilies: [
            {
              module:
                "@/src/app/design-system/ConfirmationDialogController/ConfirmationDialogController",
              root: "ConfirmationDialogController",
            },
            {
              module:
                "@/src/app/design-system/DialogController/DialogController",
              root: "DialogController",
            },
          ],
        },
      ],
    },
  },
  {
    ...tailwindcssRecommendedConfig,
    ignores: [
      ".storybook/**/*",
      "src/**/__tests__/**",
      "src/**/__e2e__/**",
      "src/**/*.clienttest.{ts,tsx}",
      "src/**/*.servertest.{ts,tsx}",
    ],
    settings: {
      tailwindcss: {
        cssConfigPath: "src/app/styles/globals.css",
      },
    },
    rules: {
      ...tailwindcssRecommendedConfig.rules,
      "tailwindcss/no-custom-classname": [
        "warn",
        {
          whitelist: [
            // Used by parent arbitrary selectors to tune IO preview section spacing.
            "io-message-header",
            // Used by parent arbitrary selectors to tune IO preview body spacing and borders.
            "io-message-content",
            // posthog-js block class: elements carrying it are excluded from session recordings.
            "ph-no-capture",
            // Component-level selector hook for code block wrappers, not a Tailwind utility.
            "codeblock",
            // Sonner root hook used by group-[.toaster] descendant variants.
            "toaster",
            // Sonner toast hook used by group-[.toast] descendant variants.
            "toast",
            // Playground window selector hook used for page/window coordination.
            "playground-window",
            // react-grid-layout requires this wrapper class for grid layout behavior.
            "layout",
            // react-grid-layout draggableHandle points at this selector.
            "drag-handle",
            // Valid Tailwind peer marker; eslint-plugin-tailwindcss v4 misses it with Tailwind v4.
            "peer",
            // Valid named Tailwind peer marker; eslint-plugin-tailwindcss v4 misses it with Tailwind v4.
            "peer/menu-button",
            // Component hooks used by the command and dialog primitives.
            "cmdk-input-wrapper",
            "dialog-header",
            "dialog-footer",
          ],
        },
      ],
      "tailwindcss/enforces-negative-arbitrary-values": "warn",
      // TODO: Enable these rule later
      "tailwindcss/classnames-order": "off",
      "tailwindcss/enforces-canonical-classname": "off",
      "tailwindcss/enforces-shorthand": "off",
      "tailwindcss/no-unnecessary-arbitrary-value": "off",
      "tailwindcss/no-contradicting-classname": "off",
    },
  },

  {
    name: "langfuse/web/no-unnecessary-cn",
    files: ["{src,pages,app}/**/*.{ts,tsx}"],
    rules: {
      "@repo/no-unnecessary-cn": [
        "warn",
        { importPath: "@/src/app/utils/tailwind" },
      ],
    },
  },

  {
    name: "langfuse/web/require-title-with-truncate",
    files: ["{src,pages,app}/**/*.{ts,tsx}"],
    ignores: ["src/**/*.stories.{ts,tsx}"],
    rules: {
      "@repo/require-title-with-truncate": [
        "error",
        { classNameFunctions: ["cn", "clsx"] },
      ],
    },
  },

  // Components should always render. Returning null/undefined hides the
  // condition that owns visibility and makes composition unpredictable — the
  // parent should branch, or the logic should live in a hook/HOC. Headless
  // children/portal passthroughs (gates, createPortal wrappers) may return
  // null; anything that owns markup may not. Existing violations use a
  // file-level eslint-disable; do not add new ones.
  {
    name: "langfuse/web/no-null-render",
    files: ["{src,pages,app}/**/*.{ts,tsx}"],
    ignores: [
      "src/__tests__/**",
      "src/__e2e__/**",
      "src/**/*.clienttest.{ts,tsx}",
      "src/**/*.servertest.{ts,tsx}",
      "src/**/*.stories.{ts,tsx}",
      "src/app/shell/layouts/**",
    ],
    rules: {
      "@repo/no-null-render": "error",
    },
  },

  // Next.js pages are the route composition root: the router, not a parent
  // component, owns whether they mount. Returning null for auth, missing
  // params, or SSR is a page-level concern, so this rule does not apply.
  {
    name: "langfuse/web/no-null-render-pages",
    files: ["pages/**/*.{ts,tsx}"],
    rules: {
      "@repo/no-null-render": "off",
    },
  },

  // Component APIs should expose explicit variants instead of className, style,
  // or prefixed variants such as badgeClassName. New file-level overrides are
  // only acceptable for headless components that do not apply any internal
  // styling themselves.
  {
    name: "langfuse/web/no-style-props",
    files: ["{src,pages,app}/**/*.{ts,tsx}"],
    ignores: [
      "src/__tests__/**",
      "src/__e2e__/**",
      "src/**/*.clienttest.{ts,tsx}",
      "src/**/*.servertest.{ts,tsx}",
    ],
    rules: {
      "@repo/no-style-props": "error",
    },
  },

  // Root design-system components follow `Name/Name.tsx`, optionally alongside
  // `Name/Name.stories.tsx`. Files must be directly inside a PascalCase folder,
  // match that folder's name, and expose a matching named runtime export. The
  // charts, factories, table, and internal subtrees are domain-specific exceptions
  // with their own structure.
  {
    name: "langfuse/web/design-system-component-structure",
    files: designSystemFiles,
    ignores: [
      "src/app/design-system/charts/**",
      "src/app/design-system/factories/**",
      "src/app/design-system/internal/**",
      "src/app/design-system/table/**",
    ],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/folder-match-with-fex": [
        "error",
        {
          "*.{ts,tsx}": "src/app/design-system/*/",
        },
      ],
      "check-file/folder-naming-convention": [
        "error",
        {
          "src/app/design-system/*/": "PASCAL_CASE",
        },
      ],
      "check-file/filename-naming-convention": [
        "error",
        {
          "src/app/design-system/*/*.{ts,tsx}": "<0>",
        },
        {
          ignoreMiddleExtensions: true,
        },
      ],
    },
  },

  {
    name: "langfuse/web/design-system-component-exports",
    files: [
      "src/app/design-system/!(legacy-primitives|animation-primitives)/*.{ts,tsx}",
    ],
    ignores: [
      "src/app/design-system/**/*.stories.{ts,tsx}",
      "src/app/design-system/charts/**",
      "src/app/design-system/table/**",
    ],
    rules: {
      "@repo/filename-matches-export": "error",
      "import/no-default-export": "error",
    },
  },

  {
    ...reactYouMightNotNeedAnEffect.configs.recommended,
    name: "langfuse/web/design-system-rules",
    files: designSystemFiles,
    ignores: ["src/app/design-system/**/*.stories.tsx"],
    plugins: {
      ...reactYouMightNotNeedAnEffect.configs.recommended.plugins,
      boundaries,
    },
    settings: {
      ...reactYouMightNotNeedAnEffect.configs.recommended.settings,
      // Progressive adoption: only these trees are classified. Unknown
      // targets (utils, hooks, third-party) stay allowed. Design-system
      // files also match `app-component`; the policy below excludes that
      // overlap with `noneOf: ["design-system"]`.
      "boundaries/files": [
        {
          category: "design-system",
          pattern:
            "src/app/design-system/!(legacy-primitives|animation-primitives)/**",
        },
        ...appComponentRoots.map((root) => ({
          category: "app-component",
          pattern: `${root}/**`,
        })),
        ...sourceStructure.domains.map(({ path }) => ({
          category: "feature",
          pattern: `${path}/**`,
        })),
      ],
    },
    rules: {
      ...reactYouMightNotNeedAnEffect.configs.recommended.rules,
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { file: { categories: "design-system" } },
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
                "Design-system files must not import application components or product capabilities.",
            },
          ],
        },
      ],
    },
  },

  {
    name: "langfuse/web/component-margin-rules",
    files: appComponentRoots.map((root) => `${root}/**/*.{ts,tsx}`),
    ignores: appComponentRoots.map((root) => `${root}/**/*.stories.{ts,tsx}`),
    rules: {
      // Margin makes components harder to compose and should therefore be applied by the parent.
      // See: https://mxstbr.com/thoughts/margin for a discussion of this pattern.
      "@repo/no-margin-on-root-elements": [
        "warn",
        { classNameFunctions: ["cn", "clsx"] },
      ],
    },
  },

  // We're using the in-app-agent directory as a testing ground for some new eslint-rules.
  {
    ...reactYouMightNotNeedAnEffect.configs.recommended,
    name: "langfuse/web/in-app-agent",
    files: ["src/ai/assistant/**/*.{ts,tsx}"],
    rules: {
      ...reactYouMightNotNeedAnEffect.configs.recommended.rules,
      "@typescript-eslint/consistent-type-definitions": ["warn", "type"],
      "@typescript-eslint/no-confusing-void-expression": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-meaningless-void-operator": "warn",
      "@typescript-eslint/no-invalid-void-type": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/return-await": ["warn", "in-try-catch"],
      curly: ["error", "all"],
      "@repo/no-switch-statements": "error",
    },
  },

  // Design-token lint wall. The type system has exactly two weights
  // (`font-bold` for the bold role; text-* size tokens carry the regular
  // weight), and colors must come from design tokens — palette utilities or
  // token-backed arbitrary values like `bg-[hsl(var(--muted))]`. Raw weight
  // utilities (font-medium, font-semibold, …) and raw colors in arbitrary
  // values (bg-[#fff], shadow-[…rgb(0_0_0/0.3)]) escape the system and break
  // theming.
  {
    name: "langfuse/web/design-tokens",
    files: ["{src,pages,app}/**/*.{ts,tsx}"],
    rules: {
      "@repo/no-raw-font-weight": "error",
      // Raw sizes of 40px and above are illustrations; the rule allows them by size.
      // Spinner sizes follow their container, not the icon scale.
      "@repo/no-raw-icon-size": [
        "error",
        {
          exceptions: ["src/app/design-system/Spinner/Spinner.tsx"],
          requireSize: true,
        },
      ],
      "@repo/no-arbitrary-colors": "error",
    },
  },

  // App-wide guard ("overlay-content" mode): a consumer must not re-introduce a
  // z-index escape on an overlay it imports (e.g. nav-user's old `z-60` on
  // DropdownMenuContent, or `z-50` on a HoverCardContent). This mode flags a
  // high z-index ONLY when it sits on an overlay *content* element (a component
  // whose name ends in `Content`), which always routes through a layer — so
  // plain page chrome (sticky headers, fixed banners/toolbars at `z-50`) inside
  // the isolated `#__next` stacking context is left alone, no false positives.
  // Declared BEFORE the wrapper block so the stricter "wrapper" mode is the
  // final word on the nine `ui/*` primitive files (flat-config last-match wins).
  {
    name: "langfuse/web/overlay-content-no-zindex-escape",
    files: ["{src,pages,app}/**/*.{ts,tsx}"],
    rules: {
      "@repo/no-overlay-zindex": ["error", { mode: "overlay-content" }],
    },
  },

  // Overlay primitive wrappers must stack via the app layer system (route the
  // portal into a layer container, see context/LayerContext/LayerContext.tsx), never by
  // escalating z-index to escape to the top. On these wrapper files, ban a
  // high/arbitrary z-index ANYWHERE (mode "wrapper") — every high z-index here
  // is an escape. z-index stays a local, within-layer tool elsewhere.
  {
    name: "langfuse/web/overlays-no-zindex-escape",
    files: [
      "src/app/design-system/legacy-primitives/dialog.tsx",
      "src/app/design-system/legacy-primitives/alert-dialog.tsx",
      "src/app/design-system/legacy-primitives/sheet.tsx",
      "src/app/design-system/legacy-primitives/drawer.tsx",
      "src/app/design-system/legacy-primitives/popover.tsx",
      "src/app/design-system/legacy-primitives/dropdown-menu.tsx",
      "src/app/design-system/legacy-primitives/select.tsx",
      "src/app/design-system/HoverCardController/HoverCardController.tsx",
      "src/app/design-system/ControlledHoverCard/ControlledHoverCard.tsx",
      "src/app/design-system/legacy-primitives/tooltip.tsx",
    ],
    rules: {
      "@repo/no-overlay-zindex": ["error", { mode: "wrapper" }],
    },
  },

  // Tests legitimately exercise backwards-compatible (deprecated) read paths
  // such as getTraceById/getObservationById, so allow them in test code.
  {
    name: "langfuse/web/tests-allow-deprecated",
    files: ["src/__tests__/**", "src/__e2e__/**", "**/*.servertest.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
    },
  },

  // Restricted import paths (patterns defined at the top of this file).
  {
    name: "langfuse/web/restricted-imports",
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...restrictedImportPatterns,
            sentryCapturePattern,
            toastImportPattern,
            designSystemInternalPattern,
          ],
        },
      ],
    },
  },

  {
    name: "langfuse/web/design-system-allow-internal-imports",
    files: designSystemFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...restrictedImportPatterns,
            sentryCapturePattern,
            toastImportPattern,
          ],
        },
      ],
    },
  },

  {
    name: "langfuse/web/design-system-internal-naming",
    files: ["src/app/design-system/internal/**/*.{ts,tsx}"],
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/folder-naming-convention": [
        "warn",
        {
          "src/app/design-system/*/": "KEBAB_CASE",
          "src/app/design-system/internal/*/": "PASCAL_CASE",
        },
      ],
    },
  },

  {
    name: "langfuse/web/design-system-internal-charts-naming",
    files: ["src/app/design-system/internal/charts/**/*.{ts,tsx}"],
    rules: {
      "check-file/folder-naming-convention": [
        "warn",
        {
          "src/app/design-system/*/": "KEBAB_CASE",
          "src/app/design-system/internal/*/": "KEBAB_CASE",
          "src/app/design-system/internal/charts/*/": "PASCAL_CASE",
        },
      ],
    },
  },

  // Sanctioned homes for raw Sentry capture APIs: the reportError seam itself
  // and the SDK init (`import * as Sentry` would otherwise trip the
  // importNames restriction). Last-match wins in flat config, so these files
  // get the shared restrictions without the Sentry capture pattern.
  {
    name: "langfuse/web/restricted-imports-sentry-seam",
    files: ["src/app/utils/reportError.ts", "instrumentation-client.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...restrictedImportPatterns,
            designSystemInternalPattern,
            toastImportPattern,
          ],
        },
      ],
    },
  },
  {
    name: "langfuse/web/toast-seam",
    files: [
      "src/app/shell/notifications/showErrorToast.tsx",
      "src/app/shell/notifications/showSuccessToast.tsx",
      "src/app/shell/notifications/showToast.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...restrictedImportPatterns,
            sentryCapturePattern,
            designSystemInternalPattern,
          ],
        },
      ],
    },
  },
  {
    name: "langfuse/web/no-dynamic-toast-bypass",
    files: ["{src,pages,app}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/^sonner(?:\\/|$)/]",
          message: toastImportPattern.message,
        },
        {
          selector:
            "CallExpression[callee.name='require'][arguments.0.value=/^sonner(?:\\/|$)/]",
          message: toastImportPattern.message,
        },
        {
          selector:
            "TSImportEqualsDeclaration[moduleReference.expression.value=/^sonner(?:\\/|$)/]",
          message: toastImportPattern.message,
        },
      ],
    },
  },
];
