/**
 * Build the MCP App views: one self-contained HTML document per view, with
 * its script bundle and Tailwind CSS inlined.
 *
 * Hosts render an app's `ui://` resource in a sandboxed iframe that cannot
 * load anything from Langfuse, so the MCP server returns these documents
 * as they are.
 *
 * Output goes to `.mcp-apps/` (gitignored). `pnpm build` runs this after
 * `next build`, which also copies it next to the standalone server, the way
 * build-otel-ingestion-worker.mjs ships its worker. In development, rerun it
 * after changing a view.
 *
 *   pnpm --filter web run build:mcp-apps
 */
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwind from "@tailwindcss/postcss";
import { build, transform } from "esbuild";

// postcss is the runner @tailwindcss/postcss itself depends on.
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
  "postcss",
);

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedSrc = path.join(webDir, "../packages/shared/src");
const outDir = path.join(webDir, ".mcp-apps");
const standaloneDir = path.join(webDir, ".next/standalone/web");
const viewsDir = path.join(webDir, "src/features/mcp/views");

const VIEWS = {
  widget: {
    title: "Langfuse widget",
    script: "src/features/mcp/views/widget/main.tsx",
    styles: "src/features/mcp/views/widget/view.css",
  },
};

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

/**
 * zod's `locales` namespace export pulls every translation (about 250 KB)
 * into the bundle. Views never show zod errors, and zod configures English
 * itself, so only that locale is kept.
 *
 * @type {import("esbuild").Plugin}
 */
const zodEnglishOnlyPlugin = {
  name: "zod-english-only",
  setup(build) {
    build.onLoad(
      { filter: /[\\/]zod[\\/]v4[\\/]locales[\\/]index\.js$/ },
      (args) => ({
        contents: 'export { default as en } from "./en.js";',
        loader: "js",
        resolveDir: path.dirname(args.path),
      }),
    );
  },
};

/**
 * Bundles a view's script. Returns the code and the web source files it
 * contains, which are the only files Tailwind needs to scan.
 *
 * @param {string} entry
 */
const bundleScript = async (entry) => {
  const result = await build({
    absWorkingDir: webDir,
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    tsconfig: "tsconfig.json",
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    write: false,
    metafile: true,
    plugins: [sharedRootPlugin, zodEnglishOnlyPlugin],
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
  const [output] = result.outputFiles;
  if (!output) throw new Error(`esbuild produced no output for ${entry}`);
  const sources = Object.keys(result.metafile.inputs)
    .filter((file) => file.startsWith("src/"))
    .map((file) => path.join(webDir, file));
  return { code: output.text, sources };
};

const globalsCss = path.join(webDir, "src/styles/globals.css");
const TAILWIND_IMPORT = '@import "tailwindcss" source("..");';

/**
 * The app's globals.css scans all of `src` for class names. A view's CSS
 * imports it, with the scan narrowed to the files in the view's bundle, so
 * the theme and base styles stay and unused utilities go.
 *
 * @param {string} file
 * @param {string[]} sources
 */
const compileStyles = async (file, sources) => {
  const viewCss = path.join(webDir, file);
  const [globals, view] = await Promise.all([
    readFile(globalsCss, "utf8"),
    readFile(viewCss, "utf8"),
  ]);
  if (!globals.includes(TAILWIND_IMPORT)) {
    throw new Error(`${globalsCss} no longer contains ${TAILWIND_IMPORT}`);
  }
  const globalsImport = `@import "${path.relative(path.dirname(viewCss), globalsCss)}";`;
  if (!view.includes(globalsImport)) {
    throw new Error(`${viewCss} must contain ${globalsImport}`);
  }
  const scan = sources
    .map(
      (source) =>
        `@source "${path.relative(path.dirname(globalsCss), source)}";`,
    )
    .join("\n");
  const narrowed = globals
    .replace(TAILWIND_IMPORT, `@import "tailwindcss" source(none);\n${scan}`)
    // The app-wide scans of third-party packages; views do not bundle them.
    .replace(/^@source "[^"]*node_modules[^"]*";\n/gm, "");
  // Relative paths in globals.css resolve against its own directory.
  const result = await postcss([tailwind({ base: webDir })]).process(
    view.replace(globalsImport, narrowed),
    { from: globalsCss },
  );
  const { code } = await transform(result.css, { loader: "css", minify: true });
  return code;
};

// Inline text must not close the surrounding element early.
/** @param {string} css */
const escapeStyle = (css) => css.replace(/<\/style/gi, "<\\/style");
/** @param {string} js */
const escapeScript = (js) => js.replace(/<\/script/gi, "<\\/script");

/** @param {{ title: string; script: string; styles: string }} view */
const toHtml = ({ title, script, styles }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${escapeStyle(styles)}</style>
</head>
<body>
<div id="root"></div>
<script>${escapeScript(script)}</script>
</body>
</html>
`;

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const [name, view] of Object.entries(VIEWS)) {
  const { code: script, sources } = await bundleScript(view.script);
  const styles = await compileStyles(view.styles, sources);
  const html = toHtml({ title: view.title, script, styles });
  await writeFile(path.join(outDir, `${name}.html`), html);
  console.log(
    `mcp-apps: ${name}.html ${(html.length / 1024).toFixed(0)} KB (js ${(script.length / 1024).toFixed(0)} KB, css ${(styles.length / 1024).toFixed(0)} KB)`,
  );
}

// A standalone build serves from .next/standalone/web; ship the views there.
if (existsSync(standaloneDir)) {
  const target = path.join(standaloneDir, ".mcp-apps");
  await rm(target, { recursive: true, force: true });
  await cp(outDir, target, { recursive: true });
  console.log("mcp-apps: copied to .next/standalone/web/.mcp-apps");
}
