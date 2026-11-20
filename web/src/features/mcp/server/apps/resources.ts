import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { env } from "@/src/env.mjs";
import { getProductBaseUrl, logger } from "@langfuse/shared/src/server";
import { MCP_APP_MIME_TYPE } from "../../core/mcp-app";

export const WIDGET_APP_RESOURCE_URI = "ui://langfuse/widget.html";

/**
 * The `ui://` document hosts load into a sandboxed iframe. Sandboxed frames
 * may not load anything from Langfuse, so the document carries everything
 * inline: the view's React bundle (scripts/build-mcp-apps.mjs) and the CSS
 * Next.js compiles for the `/mcp-apps/widget` page, which the server fetches
 * from itself.
 */
const STYLES_PAGE = "mcp-apps/widget";
const VIEW = "widget";

/** The web package directory, wherever the server was started from. */
const webDir = () =>
  [process.cwd(), join(process.cwd(), "web")].find((dir) =>
    existsSync(join(dir, "src/features/mcp/views")),
  ) ?? process.cwd();

/**
 * The view's bundled script. `pnpm build` prebuilds it; in development it is
 * rebuilt on every read, so edits show up without a separate step.
 */
const loadViewScript = async (): Promise<string> => {
  const isDev = env.NODE_ENV === "development";
  const dir = isDev ? webDir() : process.cwd();
  if (isDev) {
    await promisify(execFile)(process.execPath, [
      join(dir, "scripts/build-mcp-apps.mjs"),
    ]);
  }
  const file = [
    join(dir, ".mcp-apps", `${VIEW}.js`),
    join(dir, "web", ".mcp-apps", `${VIEW}.js`),
  ].find(existsSync);
  if (!file) throw new Error("MCP App view script is not built");
  return readFile(file, "utf8");
};

/** Fetches the stylesheets Next.js links from the styles page. */
const loadStyles = async (): Promise<string> => {
  const baseUrl = getProductBaseUrl();
  const page = await fetch(new URL(STYLES_PAGE, baseUrl), {
    signal: AbortSignal.timeout(10_000),
  });
  if (!page.ok) throw new Error(`styles page returned ${page.status}`);
  const html = await page.text();
  const hrefs = [
    ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
  ].map((match) => match[1]!);
  const sheets = await Promise.all(
    hrefs.map(async (href) => {
      const sheet = await fetch(new URL(href, baseUrl), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!sheet.ok) throw new Error(`${href} returned ${sheet.status}`);
      return sheet.text();
    }),
  );
  return sheets.join("\n");
};

// Inline text must not close the surrounding element early.
const escapeStyle = (css: string) => css.replace(/<\/style/gi, "<\\/style");
const escapeScript = (js: string) => js.replace(/<\/script/gi, "<\\/script");

const toShell = (css: string, script: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Langfuse widget</title>
<style>${escapeStyle(css)}</style>
</head>
<body>
<div id="root"></div>
<script>${escapeScript(script)}</script>
</body>
</html>
`;

const NOT_BUILT_SCRIPT = `document.getElementById("root").textContent = "The Langfuse widget is not built. Run pnpm --filter web run build:mcp-apps.";`;

let cachedShell: string | undefined;

const loadShell = async (): Promise<string> => {
  if (cachedShell) return cachedShell;
  let script = NOT_BUILT_SCRIPT;
  try {
    script = await loadViewScript();
  } catch (error) {
    logger.error("MCP App view script could not be loaded", { error });
  }
  let css = "";
  try {
    css = await loadStyles();
  } catch (error) {
    // Unstyled is better than no chart at all.
    logger.warn("MCP App styles could not be loaded", { error });
  }
  const shell = toShell(css, script);
  // Built scripts and styles only change on deploy.
  if (env.NODE_ENV === "production" && css && script !== NOT_BUILT_SCRIPT) {
    cachedShell = shell;
  }
  return shell;
};

const RESOURCE = {
  uri: WIDGET_APP_RESOURCE_URI,
  name: "Langfuse widget",
  description:
    "Chart for renderWidget results (MCP App). Hosts render it inline next to the tool call.",
  mimeType: MCP_APP_MIME_TYPE,
  _meta: { ui: { prefersBorder: false } },
};

/** MCP App documents listed as resources. */
export const listAppResources = () => [RESOURCE];

/** Contents of one MCP App document, or undefined for other URIs. */
export const readAppResource = async (uri: string) => {
  if (uri !== RESOURCE.uri) return undefined;
  return {
    uri: RESOURCE.uri,
    mimeType: RESOURCE.mimeType,
    text: await loadShell(),
    _meta: RESOURCE._meta,
  };
};
