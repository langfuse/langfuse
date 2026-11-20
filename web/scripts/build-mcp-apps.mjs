/**
 * Bundle the MCP App view scripts.
 *
 * Hosts render an app's `ui://` resource in a sandboxed iframe that cannot
 * load anything from Langfuse, so the MCP server inlines each view's script
 * (built here) and the CSS Next.js compiles for `/mcp-apps/*` into the
 * resource. `pnpm build` runs this before `next build`; in development the
 * MCP server runs it on demand, so views are always current.
 *
 * Output goes to `.mcp-apps/` (gitignored); `outputFileTracingIncludes` in
 * next.config.mjs ships it with the standalone build.
 *
 *   pnpm --filter web run build:mcp-apps
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedSrc = path.join(webDir, "../packages/shared/src");
const outDir = path.join(webDir, ".mcp-apps");
const viewsDir = path.join(webDir, "src/features/mcp/views");

const VIEWS = { widget: "src/features/mcp/views/widget/main.tsx" };

/**
 * The `@langfuse/shared` root entry re-exports the whole package, which the
 * bundler cannot drop. Views get a stand-in with just the helpers their
 * dashboard components import; a new root import fails the bundle with a
 * missing-export error, so add it here.
 */
const SHARED_ROOT = `
export { SLOW_QUERY_HINT_TEXT } from "./errors/errorMessages";
export { singleFilterList } from "./interfaces/filters";
export { truncate } from "./utils/stringChecks";
export { assertUnreachable } from "./utils/typeChecks";
`;

/** @type {import("esbuild").Plugin} */
const sharedRootPlugin = {
  name: "langfuse-shared-root",
  setup(build) {
    build.onResolve({ filter: /^@langfuse\/shared$/ }, () => ({
      path: "shared-root",
      namespace: "langfuse-shared-root",
    }));
    build.onLoad({ filter: /.*/, namespace: "langfuse-shared-root" }, () => ({
      contents: SHARED_ROOT,
      loader: "ts",
      resolveDir: sharedSrc,
    }));
  },
};

await mkdir(outDir, { recursive: true });
for (const [name, entry] of Object.entries(VIEWS)) {
  const result = await build({
    absWorkingDir: webDir,
    entryPoints: [entry],
    outfile: path.join(outDir, `${name}.js`),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    tsconfig: "tsconfig.json",
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    metafile: true,
    plugins: [sharedRootPlugin],
    alias: {
      // Shared's subpath entry points resolve to CommonJS `dist`; its source
      // tree-shakes far better, the same way Storybook aliases it.
      "@langfuse/shared/query": path.join(sharedSrc, "features/query"),
      "@langfuse/shared/src": sharedSrc,
      // Design-system buttons and tabs import next/link; views never
      // navigate, and a plain anchor avoids bundling Next's router.
      "next/link": path.join(viewsDir, "next-link/Link.tsx"),
    },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": "{}",
    },
    banner: { js: "var process={env:{}};var global=globalThis;" },
  });
  const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
  console.log(`mcp-apps: ${name}.js ${(bytes / 1024).toFixed(0)} KB`);
}
