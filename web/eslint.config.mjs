import nextConfig from "@repo/eslint-config/next";

const spielwieseRestrictedImportPaths = [
  {
    name: "react",
    importNames: ["useEffect"],
    message:
      "Do not use useEffect directly in spielwiese. Derive state during render, move action logic into an event handler, use a query abstraction, or use useMountEffect only for mount-time external sync.",
  },
  {
    name: "react",
    importNames: ["useLayoutEffect"],
    message:
      "Do not use useLayoutEffect directly in spielwiese. If DOM measurement or imperative integration is truly required, isolate it in a focused hook and document why.",
  },
];

const spielwieseRestrictedImportPatterns = [
  {
    group: ["@radix-ui/react-*"],
    message:
      "Do not import @radix-ui/react-* directly in spielwiese. Use the tracked local primitive layer under src/features/spielwiese/ui/*.",
  },
  {
    group: ["@/src/components/ui", "@/src/components/ui/**"],
    message:
      "Do not import shared src/components/ui/* in spielwiese. Use the tracked local primitive layer under src/features/spielwiese/ui/*.",
  },
  {
    group: ["@/src/components/nav", "@/src/components/nav/**"],
    message:
      "Do not reuse current product shell or layout internals in spielwiese. Keep the redesign track isolated.",
  },
  {
    group: [
      "@/src/components/layouts/app-layout",
      "@/src/components/layouts/app-layout/**",
    ],
    message:
      "Do not reuse current product shell or layout internals in spielwiese. Keep the redesign track isolated.",
  },
  {
    group: ["@/src/product/*", "@/src/product/**"],
    message:
      "Do not reuse current product shell or layout internals in spielwiese. Keep the redesign track isolated.",
  },
  {
    group: [
      "@/src/features/*",
      "@/src/features/*/**",
      "!@/src/features/spielwiese",
      "!@/src/features/spielwiese/**",
    ],
    message:
      "Do not import UI primitives from unrelated features. Use the local spielwiese design-system or a spielwiese composite instead.",
  },
  {
    group: ["**/.context/**"],
    message:
      "Do not import from .context. Scratch and generator artifacts must never become runtime source.",
  },
  {
    group: ["@/src/features/spielwiese/ui"],
    message:
      "Do not import from a spielwiese UI barrel. Import directly from the concrete file for clearer ownership.",
  },
];

const spielwieseDesignSystemPrimitiveBypassPatterns = [
  {
    group: [
      "@/src/features/spielwiese/design-system/primitives",
      "@/src/features/spielwiese/design-system/primitives/**",
      "../design-system/primitives",
      "../design-system/primitives/**",
      "../../design-system/primitives",
      "../../design-system/primitives/**",
    ],
    message:
      "Do not import Spielwiese design-system primitive internals directly. Use the public runtime layer under src/features/spielwiese/ui/*.",
  },
];

/**
 * @param {Array<string | { group: string[]; message: string }>} extraPatterns
 */
function withSpielwieseImportRestrictions(extraPatterns = []) {
  return [
    "error",
    {
      paths: spielwieseRestrictedImportPaths,
      patterns: [...spielwieseRestrictedImportPatterns, ...extraPatterns],
    },
  ];
}

export default [
  ...nextConfig,

  // Restrict react-icons imports
  {
    name: "langfuse/web/react-icons-restriction",
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react-icons",
                "react-icons/!(si|tb)",
                "react-icons/!(si|tb)/*",
              ],
              message:
                "Only react-icons/si and react-icons/tb are allowed. Please use lucide-react for other icons.",
            },
          ],
        },
      ],
    },
  },

  // Exceptions for specific files
  {
    name: "langfuse/web/react-icons-exceptions",
    files: [
      "src/components/nav/support-menu-dropdown.tsx",
      "src/pages/auth/sign-in.tsx",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  {
    name: "langfuse/web/spielwiese-guardrails",
    files: [
      "src/features/spielwiese/**/*.{ts,tsx}",
      "src/pages/dev/spielwiese.tsx",
    ],
    rules: {
      "no-else-return": "error",
      "max-depth": ["error", 3],
      complexity: ["warn", 10],
      "no-nested-ternary": "error",
      "no-param-reassign": ["error", { props: true }],
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "prefer-const": "error",
      "no-unreachable": "error",
      "no-unneeded-ternary": "error",
      "no-cond-assign": ["error", "always"],
      "no-return-assign": ["error", "always"],
      "no-sequences": "error",
      "no-implicit-coercion": ["error", { allow: ["!!"] }],
      "no-multi-assign": "error",
      "prefer-template": "error",
      "object-shorthand": ["error", "always"],
      "max-lines": [
        "warn",
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-lines-per-function": [
        "warn",
        {
          max: 60,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-params": ["warn", 3],
      "react/no-unstable-nested-components": [
        "error",
        {
          allowAsProps: false,
        },
      ],
      "react/no-array-index-key": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 8,
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-restricted-imports": withSpielwieseImportRestrictions(),
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='React'][callee.property.name='useEffect']",
          message:
            "Do not use React.useEffect directly in spielwiese. Derive state during render, move action logic into an event handler, use a query abstraction, or use useMountEffect only for mount-time external sync.",
        },
        {
          selector:
            "CallExpression[callee.object.name='React'][callee.property.name='useLayoutEffect']",
          message:
            "Do not use React.useLayoutEffect directly in spielwiese. If DOM measurement or imperative integration is truly required, isolate it in a focused hook and document why.",
        },
      ],
    },
  },

  {
    name: "langfuse/web/spielwiese-ui-layer-boundary",
    files: ["src/features/spielwiese/ui/**/*.{ts,tsx}"],
    ignores: ["src/features/spielwiese/**/*.clienttest.{ts,tsx}"],
    rules: {
      "no-restricted-imports": withSpielwieseImportRestrictions([
        {
          group: [
            "../components",
            "../components/**",
            "@/src/features/spielwiese/components",
            "@/src/features/spielwiese/components/**",
          ],
          message:
            "spielwiese/ui/* is the primitive layer. It must not depend on spielwiese/components/*.",
        },
        {
          group: [
            "../shell",
            "../shell/**",
            "@/src/features/spielwiese/shell",
            "@/src/features/spielwiese/shell/**",
          ],
          message:
            "spielwiese/ui/* is the primitive layer. It must not depend on spielwiese/shell/*.",
        },
        {
          group: [
            "../pages",
            "../pages/**",
            "@/src/features/spielwiese/pages",
            "@/src/features/spielwiese/pages/**",
          ],
          message:
            "spielwiese/ui/* is the primitive layer. It must not depend on spielwiese/pages/*.",
        },
        {
          group: [
            "../adapters",
            "../adapters/**",
            "@/src/features/spielwiese/adapters",
            "@/src/features/spielwiese/adapters/**",
          ],
          message:
            "spielwiese/ui/* is the primitive layer. It must not depend on spielwiese/adapters/*.",
        },
        {
          group: [
            "../mock",
            "../mock/**",
            "@/src/features/spielwiese/mock",
            "@/src/features/spielwiese/mock/**",
          ],
          message:
            "spielwiese/ui/* is the primitive layer. It must not depend on spielwiese/mock/*.",
        },
      ]),
    },
  },

  {
    name: "langfuse/web/spielwiese-components-layer-boundary",
    files: ["src/features/spielwiese/components/**/*.{ts,tsx}"],
    ignores: ["src/features/spielwiese/**/*.clienttest.{ts,tsx}"],
    rules: {
      "no-restricted-imports": withSpielwieseImportRestrictions([
        ...spielwieseDesignSystemPrimitiveBypassPatterns,
        {
          group: [
            "../shell",
            "../shell/**",
            "@/src/features/spielwiese/shell",
            "@/src/features/spielwiese/shell/**",
          ],
          message:
            "spielwiese/components/* should stay reusable. Do not depend on spielwiese/shell/*.",
        },
        {
          group: [
            "../pages",
            "../pages/**",
            "@/src/features/spielwiese/pages",
            "@/src/features/spielwiese/pages/**",
          ],
          message:
            "spielwiese/components/* should stay reusable. Do not depend on spielwiese/pages/*.",
        },
        {
          group: [
            "../adapters",
            "../adapters/**",
            "@/src/features/spielwiese/adapters",
            "@/src/features/spielwiese/adapters/**",
          ],
          message:
            "spielwiese/components/* should receive view models via props. Do not depend on spielwiese/adapters/*.",
        },
        {
          group: [
            "../mock",
            "../mock/**",
            "@/src/features/spielwiese/mock",
            "@/src/features/spielwiese/mock/**",
          ],
          message:
            "spielwiese/components/* should stay runtime-focused. Do not depend on spielwiese/mock/*.",
        },
      ]),
    },
  },

  {
    name: "langfuse/web/spielwiese-shell-layer-boundary",
    files: ["src/features/spielwiese/shell/**/*.{ts,tsx}"],
    ignores: ["src/features/spielwiese/**/*.clienttest.{ts,tsx}"],
    rules: {
      "no-restricted-imports": withSpielwieseImportRestrictions([
        ...spielwieseDesignSystemPrimitiveBypassPatterns,
        {
          group: [
            "../pages",
            "../pages/**",
            "@/src/features/spielwiese/pages",
            "@/src/features/spielwiese/pages/**",
          ],
          message:
            "spielwiese/shell/* should stay page-agnostic. Do not depend on spielwiese/pages/*.",
        },
        {
          group: [
            "../adapters",
            "../adapters/**",
            "@/src/features/spielwiese/adapters",
            "@/src/features/spielwiese/adapters/**",
          ],
          message:
            "spielwiese/shell/* should receive data via props. Do not depend on spielwiese/adapters/*.",
        },
        {
          group: [
            "../mock",
            "../mock/**",
            "@/src/features/spielwiese/mock",
            "@/src/features/spielwiese/mock/**",
          ],
          message:
            "spielwiese/shell/* should receive data via props. Do not depend on spielwiese/mock/*.",
        },
      ]),
    },
  },

  {
    name: "langfuse/web/spielwiese-pages-layer-boundary",
    files: ["src/features/spielwiese/pages/**/*.{ts,tsx}"],
    ignores: ["src/features/spielwiese/**/*.clienttest.{ts,tsx}"],
    rules: {
      "no-restricted-imports": withSpielwieseImportRestrictions(
        spielwieseDesignSystemPrimitiveBypassPatterns,
      ),
    },
  },
];
