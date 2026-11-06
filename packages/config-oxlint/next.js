export default {
  categories: { correctness: "off" },
  plugins: ["typescript", "react", "import", "jsx-a11y", "nextjs", "unicorn"],
  options: { typeAware: true, reportUnusedDisableDirectives: "warn" },
  ignorePatterns: [
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
  overrides: [
    {
      files: ["**/index.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
      excludeFiles: [
        "**/*.{test,spec,clienttest,servertest,stories,story}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
        "**/{__tests__,__mocks__,tests,test,__stories__,stories}/**",
      ],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-internal-barrel-files": "warn",
      },
    },
    {
      // Next.js discovers routes by filename, not imports.
      files: ["src/pages/**/*.{js,jsx,ts,tsx}"],
      rules: { "@repo/no-internal-barrel-files": "off" },
    },
    {
      files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
      jsPlugins: [{ name: "next-js", specifier: "@next/eslint-plugin-next" }],
      env: {
        node: true,
        browser: true,
      },
      rules: {
        "next-js/no-location-assign-relative-destination": "warn",
        "nextjs/google-font-display": "warn",
        "nextjs/google-font-preconnect": "warn",
        "nextjs/next-script-for-ga": "warn",
        "nextjs/no-async-client-component": "warn",
        "nextjs/no-before-interactive-script-outside-document": "warn",
        "nextjs/no-css-tags": "warn",
        "nextjs/no-head-element": "warn",
        "nextjs/no-html-link-for-pages": "warn",
        "nextjs/no-img-element": "off",
        "nextjs/no-page-custom-font": "warn",
        "nextjs/no-styled-jsx-in-document": "warn",
        "nextjs/no-sync-scripts": "warn",
        "nextjs/no-title-in-document-head": "warn",
        "nextjs/no-typos": "warn",
        "nextjs/no-unwanted-polyfillio": "warn",
        "nextjs/inline-script-id": "warn",
        "nextjs/no-assign-module-variable": "warn",
        "nextjs/no-document-import-in-page": "warn",
        "next-js/no-duplicate-head": "warn",
        "nextjs/no-head-import-in-document": "warn",
        "nextjs/no-script-component-in-head": "warn",
        "import/no-anonymous-default-export": "warn",
        "import/no-duplicates": [
          "warn",
          {
            preferInline: true,
          },
        ],
        "jsx-a11y/alt-text": [
          "warn",
          {
            elements: ["img"],
            img: ["Image"],
          },
        ],
        "jsx-a11y/aria-props": "warn",
        "jsx-a11y/aria-proptypes": "warn",
        "jsx-a11y/aria-unsupported-elements": "warn",
        "jsx-a11y/role-has-required-aria-props": "warn",
        "jsx-a11y/role-supports-aria-props": "warn",
      },
    },
    {
      files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
      excludeFiles: ["**/*.servertest.{ts,tsx}"],
      jsPlugins: [{ name: "react-js", specifier: "eslint-plugin-react" }],
      rules: {
        "react-js/no-deprecated": "warn",
        "react/display-name": "warn",
        "react/jsx-key": [
          "warn",
          {
            checkFragmentShorthand: false,
            checkKeyMustBeforeSpread: false,
            warnOnDuplicates: false,
          },
        ],
        "react/jsx-no-comment-textnodes": "warn",
        "react/jsx-no-duplicate-props": "warn",
        "react/jsx-no-target-blank": "off",
        "react/jsx-no-undef": "warn",
        "react/no-children-prop": "warn",
        "react/no-danger-with-children": "warn",
        "react/no-direct-mutation-state": "warn",
        "react/no-find-dom-node": "warn",
        "react/no-is-mounted": "warn",
        "react/no-render-return-value": "warn",
        "react/no-string-refs": "warn",
        "react/no-unescaped-entities": "warn",
        "react/no-unknown-property": "off",
        "react/no-unsafe": "off",
        "react/react-in-jsx-scope": "off",
        "react/require-render-return": "warn",
        "react/rules-of-hooks": "warn",
        "react/exhaustive-deps": "warn",
        "react/static-components": "warn",
        "react/use-memo": "warn",
        "react/preserve-manual-memoization": "warn",
        "react/incompatible-library": "warn",
        "react/immutability": "warn",
        "react/globals": "warn",
        "react/refs": "warn",
        "react/set-state-in-effect": "warn",
        "react/error-boundaries": "warn",
        "react/purity": "warn",
        "react/set-state-in-render": "warn",
        "react/unsupported-syntax": "warn",
        "react/jsx-no-useless-fragment": "warn",
        "react/no-unstable-nested-components": "warn",
      },
    },
    {
      files: ["**/*"],
      excludeFiles: ["**/*.servertest.{ts,tsx}"],
      rules: {
        "react/error-boundaries": "off",
        "react/globals": "off",
        "react/immutability": "off",
        "react/incompatible-library": "off",
        "react/preserve-manual-memoization": "off",
        "react/purity": "off",
        "react/refs": "off",
        "react/set-state-in-effect": "off",
        "react/set-state-in-render": "off",
        "react/unsupported-syntax": "off",
        "react/use-memo": "off",
      },
    },
    {
      files: ["**/*"],
      jsPlugins: ["eslint-plugin-turbo"],
      rules: {
        "turbo/no-undeclared-env-vars": "warn",
      },
    },
    {
      files: ["**/*"],
      rules: {
        curly: "off",
        "no-unexpected-multiline": "off",
        "unicorn/empty-brace-spaces": "off",
        "unicorn/no-nested-ternary": "off",
        "unicorn/number-literal-case": "off",
      },
    },
    {
      files: ["**/*"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "no-unassigned-vars": "off",
        "no-useless-assignment": "off",
        "preserve-caught-error": "off",
        "no-shadow-restricted-names": [
          "warn",
          {
            reportGlobalThis: false,
          },
        ],
        "no-void": "warn",
        "no-else-return": "warn",
        "no-unneeded-ternary": "warn",
        "no-nested-ternary": "warn",
        "no-use-before-define": [
          "warn",
          {
            functions: false,
            classes: false,
          },
        ],
        "@repo/no-exotic-operators": "warn",
        "@repo/no-restricted-prisma-writes": [
          "warn",
          {
            models: {
              apiKey: ["packages/shared/src/server/auth/apiKeys.ts"],
              roleAssignment: [
                "packages/shared/src/features/rbac/roleAssignmentService.ts",
              ],
            },
          },
        ],
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      rules: {
        "no-use-before-define": [
          "warn",
          {
            functions: false,
            classes: false,
          },
        ],
        "no-unused-vars": [
          "warn",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
            destructuredArrayIgnorePattern: "^_",
            ignoreRestSiblings: true,
          },
        ],
        "typescript/no-inferrable-types": "warn",
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      excludeFiles: ["**/*.test.ts", "**/*.servertest.ts", "**/__tests__/**"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-unescaped-prisma-like-pattern": "warn",
      },
    },
    {
      files: ["**/*"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-in-source-vitest": "warn",
      },
    },
    {
      files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-let-assign-in-react": "warn",
      },
    },
    {
      files: ["**/*"],
      jsPlugins: ["eslint-plugin-turbo"],
      rules: {
        "turbo/no-undeclared-env-vars": "off",
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      excludeFiles: ["**/vitest.config.mts"],
      globals: {
        React: "readonly",
        JSX: "readonly",
      },
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-tailwind-overflow-scroll": "warn",
        "typescript/consistent-type-imports": [
          "warn",
          {
            prefer: "type-imports",
            fixStyle: "inline-type-imports",
          },
        ],
        "typescript/no-deprecated": "warn",
      },
    },
    {
      files: ["**/*.{ts,tsx,mts,cts}"],
      excludeFiles: ["**/*.servertest.{ts,tsx}"],
      jsPlugins: [{ name: "react-js", specifier: "eslint-plugin-react" }],
      rules: {
        "react-js/no-unused-prop-types": "warn",
        "react/jsx-curly-brace-presence": [
          "warn",
          {
            props: "never",
            children: "ignore",
            propElementValues: "always",
          },
        ],
        "react/jsx-key": [
          "warn",
          {
            warnOnDuplicates: true,
            checkFragmentShorthand: false,
            checkKeyMustBeforeSpread: false,
          },
        ],
      },
    },
    {
      files: [
        "**/*.clienttest.{ts,tsx}",
        "**/*.servertest.{ts,tsx}",
        "**/*.test.{ts,tsx}",
        "**/*.story.{ts,tsx}",
        "**/*.stories.{ts,tsx}",
      ],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/no-tailwind-overflow-scroll": "off",
      },
    },
    {
      files: ["**/*.clienttest.{ts,tsx}"],
      jsPlugins: ["@repo/eslint-plugin"],
      rules: {
        "@repo/prefer-stories-over-client-tests": "warn",
      },
    },
  ],
};
