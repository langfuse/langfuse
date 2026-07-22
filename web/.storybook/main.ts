import type { StorybookConfig } from "@storybook/nextjs-vite";

import { dirname, resolve } from "path";

import { fileURLToPath } from "url";

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */
function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    getAbsolutePath("@storybook/addon-a11y"),
    getAbsolutePath("@storybook/addon-docs"),
    getAbsolutePath("@storybook/addon-vitest"),
  ],
  framework: getAbsolutePath("@storybook/nextjs-vite"),
  staticDirs: ["../public"],
  // Resolve `@langfuse/shared` to its TypeScript source, mirroring the app's
  // own alias (next.config.mjs: webpack alias + turbopack.resolveAlias both map
  // "@langfuse/shared" -> "./packages/shared/src"). The package's published
  // entry is a CommonJS bundle whose deeply transitive `export *` re-export
  // chains (e.g. MediaReferenceStringSchema, re-exported through
  // utils/IORepresentation/chatML) are not statically resolvable by Rollup's /
  // Vite's CJS named-export lexer, so a Storybook build (and the dev server)
  // fails with "X is not exported by packages/shared/dist/src/index.js" for any
  // story whose dependency graph touches such an export (e.g. LangfuseMediaView,
  // pulled in transitively by the table stories). Pointing at the source makes
  // Storybook resolve named exports exactly like the app does.
  viteFinal: async (viteConfig) => {
    const sharedSrc = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../packages/shared/src",
    );
    const prismaBrowserStub = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "./prisma-browser-stub.cjs",
    );
    viteConfig.resolve = viteConfig.resolve ?? {};
    // Use the array form with regex `find`s for *exact* matching. The object
    // form is treated by Vite/Rollup as a literal prefix replacement, so an
    // import like `@langfuse/shared/src/db` would become `.../src/src/db`
    // (double `src`) and fail to resolve. The bare specifier and the
    // `@langfuse/shared/src/...` subpaths (which the package's `exports` map
    // under `src/`) are handled by two distinct, anchored rules — matching how
    // the app aliases the package (next.config.mjs: transpilePackages +
    // turbopack.resolveAlias "@langfuse/shared" -> "./packages/shared/src").
    const existingAlias = viteConfig.resolve.alias ?? {};
    const aliasArray = Array.isArray(existingAlias)
      ? existingAlias
      : Object.entries(existingAlias).map(([find, replacement]) => ({
          find,
          replacement: replacement as string,
        }));
    viteConfig.resolve.alias = [
      // The package also exposes a few named subpath exports (e.g.
      // `@langfuse/shared/query`, imported transitively via the chart-library's
      // PivotTable → widgets/utils). Those aren't under `src/`, so the two rules
      // below miss them and they fall through to the CJS dist bundle, whose
      // re-exported names (e.g. `getViewDeclaration`) Vite's lexer can't resolve
      // — the same failure the bare-specifier rule fixes. Map the source-safe
      // subpaths to source too. (`query/index.ts` only re-exports client-safe
      // dataModel/types/validateQuery.)
      {
        find: /^@langfuse\/shared\/query$/,
        replacement: `${sharedSrc}/features/query`,
      },
      {
        find: /^\.prisma\/client\/index-browser$/,
        replacement: prismaBrowserStub,
      },
      {
        find: /^@langfuse\/shared\/src\/(.*)$/,
        replacement: `${sharedSrc}/$1`,
      },
      { find: /^@langfuse\/shared$/, replacement: sharedSrc },
      ...aliasArray,
    ];
    return viteConfig;
  },
};

export default config;
