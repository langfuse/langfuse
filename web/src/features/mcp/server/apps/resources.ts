import { env } from "@/src/env.mjs";
import { getProductBaseUrl, logger } from "@langfuse/shared/src/server";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpUiResourceMeta } from "@modelcontextprotocol/ext-apps";

export const WIDGET_APP_RESOURCE_URI = "ui://langfuse/widget.html";

/**
 * The `ui://` document is the HTML of the Next.js page `/mcp-apps/widget`
 * (`src/app/mcp-apps`), fetched from this server process. Hosts write it into a
 * sandboxed iframe on their own origin, so its root-relative `/_next/` URLs
 * would load from the host; they are made absolute instead. A `<base>` would
 * be shorter, but hosts default to `base-uri 'self'`.
 */
const WIDGET_PAGE = "mcp-apps/widget";

const UNAVAILABLE = `<!doctype html><html><body><p style="font-family:sans-serif;color:#888">The Langfuse widget could not be loaded.</p></body></html>`;

const isDev = env.NODE_ENV === "development";

/**
 * The page on this process itself, not behind the public URL: a load
 * balancer could answer from a pod on another build, whose chunks this
 * deployment stops serving once that pod is gone. Next.js listens on PORT
 * and, in the standalone server, on HOSTNAME.
 */
const ownPageUrl = () => {
  const host = process.env.HOSTNAME;
  const hostname =
    !host || host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return `http://${hostname}:${process.env.PORT ?? "3000"}${env.NEXT_PUBLIC_BASE_PATH ?? ""}/${WIDGET_PAGE}`;
};

/** Where the page lives and where its `/_next/` assets load from. */
const origins = () => {
  const app = getProductBaseUrl().origin;
  const assets = env.NEXT_PUBLIC_ASSET_PREFIX
    ? new URL(env.NEXT_PUBLIC_ASSET_PREFIX).origin
    : app;
  return {
    app,
    assets,
    // Next.js prefixes asset paths with the base path only without a prefix.
    assetPath: `${env.NEXT_PUBLIC_ASSET_PREFIX ? "" : (env.NEXT_PUBLIC_BASE_PATH ?? "")}/_next/`,
  };
};

/** The global Turbopack's browser runtime reads its chunk base URL from. */
type TurbopackGlobal = typeof globalThis & {
  TURBOPACK_CHUNK_BASE_PATH?: string;
};

/**
 * Runs in the host's iframe before Next.js does. Inlined with `toString()`,
 * so it must not reference anything outside itself (types are erased).
 */
function prepareFrame(chunkBaseUrl: string, devServerOrigin: string | null) {
  // Turbopack loads further chunks from here; by default it resolves them
  // against the document, which is the host's.
  (globalThis as TurbopackGlobal).TURBOPACK_CHUNK_BASE_PATH = chunkBaseUrl;

  // The App Router writes its URL into history, which a sandboxed frame may
  // refuse. The widget never navigates.
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (...args) => {
      try {
        original(...args);
      } catch {
        // Ignored: see above.
      }
    };
  }

  // `next dev` only: its HMR socket would connect to the host's origin, and
  // Next.js does not hydrate without it.
  if (devServerOrigin) {
    const devServer = new URL(devServerOrigin);
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const target = new URL(url, location.href);
        if (target.host === location.host) {
          target.protocol = devServer.protocol === "https:" ? "wss:" : "ws:";
          target.host = devServer.host;
        }
        super(target, protocols);
      }
    };
  }
}

/** The page's HTML, prepared to run from the host's iframe. */
const toFrameDocument = (html: string) => {
  const { app, assets, assetPath } = origins();
  const absolute = `${assets}${assetPath}`;
  const script = `<script>(${prepareFrame})(${JSON.stringify(absolute)}, ${JSON.stringify(isDev ? app : null)});</script>`;
  return (
    html
      .replace(/<head[^>]*>/i, (head) => head + script)
      // Covers tags and the inline RSC payload, whose strings name the
      // chunks to load (with escaped quotes, which this also matches).
      .replaceAll(`"${assetPath}`, `"${absolute}`)
  );
};

let cachedPage: string | undefined;

const loadPage = async (): Promise<string> => {
  if (cachedPage) return cachedPage;
  const url = ownPageUrl();
  try {
    const response = await fetch(url, {
      headers: { accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const page = toFrameDocument(await response.text());
    // The page only changes on deploy; in development every read refetches.
    if (env.NODE_ENV === "production") cachedPage = page;
    return page;
  } catch (error) {
    logger.error("MCP App page could not be loaded", { error, url });
    return UNAVAILABLE;
  }
};

/**
 * Origins the host's iframe may load from (`resourceDomains`) and connect to
 * (`connectDomains`: devtools fetching source maps, and the dev server's HMR
 * socket). Hosts block everything else. Data arrives in the tool result.
 */
const resourceMeta = (): { ui: McpUiResourceMeta } => {
  const { app, assets } = origins();
  const domains = [...new Set([app, assets])];
  return {
    ui: {
      prefersBorder: false,
      csp: {
        resourceDomains: domains,
        connectDomains: isDev
          ? [...domains, app.replace(/^http/, "ws")]
          : domains,
      },
    },
  };
};

const RESOURCE = {
  uri: WIDGET_APP_RESOURCE_URI,
  name: "Langfuse widget",
  description:
    "Chart for renderWidget results (MCP App). Hosts render it inline next to the tool call.",
  mimeType: RESOURCE_MIME_TYPE,
};

/** MCP App documents listed as resources. */
export const listAppResources = () => [{ ...RESOURCE, _meta: resourceMeta() }];

/** Contents of one MCP App document, or undefined for other URIs. */
export const readAppResource = async (uri: string) => {
  if (uri !== RESOURCE.uri) return undefined;
  return {
    uri: RESOURCE.uri,
    mimeType: RESOURCE.mimeType,
    text: await loadPage(),
    _meta: resourceMeta(),
  };
};
