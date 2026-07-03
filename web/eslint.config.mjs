import { globalIgnores } from "eslint/config";
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
    name: "langfuse/web/design-system-rules",
    files: ["src/components/design-system/**/*.{ts,tsx}"],
    ignores: ["src/components/design-system/**/*.stories.tsx"],
    rules: {
      // Design-system component APIs must use explicit variants instead of styling escape hatches.
      "@repo/no-style-props": "error",

      // Margin makes components harder to compose and should therefore be applied by the parent.
      // See: https://mxstbr.com/thoughts/margin for a discussion of this pattern.
      // TODO: Consider expanding this rule beyond design-system components
      "@repo/no-margin-on-root-elements": [
        "warn",
        { classNameFunctions: ["cn", "clsx"] },
      ],
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

  // Restrict react-icons imports
  {
    name: "langfuse/web/react-icons-restriction",
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
          ],
        },
      ],
    },
  },
];
