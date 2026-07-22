import { globalIgnores } from "eslint/config";
import reactYouMightNotNeedAnEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import storybook from "eslint-plugin-storybook";
import eslintPluginTailwindcss from "eslint-plugin-tailwindcss";

import nextConfig from "@repo/eslint-config/next";

// eslint-plugin-tailwindcss types this as Config | ConfigArray, but the
// recommended export is a single flat config object with rules at runtime.
const tailwindcssRecommendedConfig =
  /** @type {import("eslint").Linter.Config} */ (
    eslintPluginTailwindcss.configs.recommended
  );

export default [
  globalIgnores(["**/storybook-static/"]),

  ...nextConfig,
  ...storybook.configs["flat/recommended"],
  {
    ...tailwindcssRecommendedConfig,
    settings: {
      tailwindcss: {
        cssConfigPath: "src/styles/globals.css",
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
          ],
        },
      ],
      "tailwindcss/enforces-negative-arbitrary-values": "warn",
      // TODO: Enable these rule later
      "tailwindcss/classnames-order": "off",
      "tailwindcss/enforces-shorthand": "off",
      "tailwindcss/no-unnecessary-arbitrary-value": "off",
      "tailwindcss/no-contradicting-classname": "off",
    },
  },

  {
    name: "langfuse/web/no-unnecessary-cn",
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@repo/no-unnecessary-cn": [
        "warn",
        { importPath: "@/src/utils/tailwind" },
      ],
    },
  },

  {
    name: "langfuse/web/require-title-with-truncate",
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.stories.{ts,tsx}"],
    rules: {
      "@repo/require-title-with-truncate": [
        "error",
        { classNameFunctions: ["cn", "clsx"] },
      ],
    },
  },

  {
    ...reactYouMightNotNeedAnEffect.configs.recommended,
    name: "langfuse/web/design-system-rules",
    files: ["src/components/design-system/**/*.{ts,tsx}"],
    ignores: ["src/components/design-system/**/*.stories.tsx"],
    rules: {
      ...reactYouMightNotNeedAnEffect.configs.recommended.rules,
      // Design-system component APIs must use explicit variants instead of styling escape hatches.
      "@repo/no-style-props": "error",

      // Margin makes components harder to compose and should therefore be applied by the parent.
      // See: https://mxstbr.com/thoughts/margin for a discussion of this pattern.
      // TODO: Consider expanding this rule beyond design-system components
      "@repo/no-margin-on-root-elements": [
        "warn",
        { classNameFunctions: ["cn", "clsx"] },
      ],

      // TODO: Expand to more of the codebase
      "no-nested-ternary": "error",
    },
  },

  // We're using the in-app-agent directory as a testing ground for some new eslint-rules.
  {
    ...reactYouMightNotNeedAnEffect.configs.recommended,
    name: "langfuse/web/in-app-agent",
    files: ["src/ee/features/in-app-agent/**/*.{ts,tsx}"],
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
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@repo/no-raw-font-weight": "error",
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
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@repo/no-overlay-zindex": ["error", { mode: "overlay-content" }],
    },
  },

  // Overlay primitive wrappers must stack via the app layer system (route the
  // portal into a layer container, see components/ui/layer.tsx), never by
  // escalating z-index to escape to the top. On these wrapper files, ban a
  // high/arbitrary z-index ANYWHERE (mode "wrapper") — every high z-index here
  // is an escape. z-index stays a local, within-layer tool elsewhere.
  {
    name: "langfuse/web/overlays-no-zindex-escape",
    files: [
      "src/components/ui/dialog.tsx",
      "src/components/ui/alert-dialog.tsx",
      "src/components/ui/sheet.tsx",
      "src/components/ui/drawer.tsx",
      "src/components/ui/popover.tsx",
      "src/components/ui/dropdown-menu.tsx",
      "src/components/ui/select.tsx",
      "src/components/ui/hover-card.tsx",
      "src/components/ui/tooltip.tsx",
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

  // Restricted import paths. Flat config replaces (not merges) a rule that is
  // configured twice, so all no-restricted-imports patterns live in this one
  // block.
  {
    name: "langfuse/web/restricted-imports",
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
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
          ],
        },
      ],
    },
  },
];
