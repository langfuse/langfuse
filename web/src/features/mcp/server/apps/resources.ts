import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { MCP_APP_MIME_TYPE } from "../../core/mcp-app";

export const WIDGET_APP_RESOURCE_URI = "ui://langfuse/widget.html";

/**
 * The `ui://` document hosts load into a sandboxed iframe. Sandboxed frames
 * may not load anything from Langfuse, so the view is one self-contained
 * HTML file with its script and Tailwind CSS inlined, built by
 * scripts/build-mcp-apps.mjs (`pnpm --filter web run build:mcp-apps`, also
 * the last step of `pnpm build`).
 */
const VIEW_FILE = "widget.html";

const NOT_BUILT = `<!doctype html><html><body><p style="font-family:sans-serif;color:#888">The Langfuse widget is not built. Run pnpm --filter web run build:mcp-apps.</p></body></html>`;

/** The built view next to the standalone server, or in the web package. */
const findView = () => {
  const serverEntry = process.argv[1];
  return [
    ...(serverEntry ? [dirname(resolve(serverEntry))] : []),
    process.cwd(),
    join(process.cwd(), "web"),
  ]
    .map((dir) => join(dir, ".mcp-apps", VIEW_FILE))
    .find(existsSync);
};

let cachedView: string | undefined;

const loadView = async (): Promise<string> => {
  if (cachedView) return cachedView;
  const file = findView();
  if (!file) {
    logger.error("MCP App view is not built", { view: VIEW_FILE });
    return NOT_BUILT;
  }
  const view = await readFile(file, "utf8");
  // Built views only change on deploy; in development, rerunning
  // build:mcp-apps shows up on the next read.
  if (env.NODE_ENV === "production") cachedView = view;
  return view;
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
    text: await loadView(),
    _meta: RESOURCE._meta,
  };
};
