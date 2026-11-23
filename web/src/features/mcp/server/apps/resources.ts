import { env } from "@/src/env.mjs";
import { getProductBaseUrl, logger } from "@langfuse/shared/src/server";
import { MCP_APP_MIME_TYPE } from "../../core/mcp-app";

export const WIDGET_APP_RESOURCE_URI = "ui://langfuse/widget.html";

/**
 * The `ui://` document is the HTML of a Next.js page (`src/app/mcp-apps`),
 * which the server fetches from itself. Hosts write it into a sandboxed
 * iframe on their own origin, so before returning it the server points its
 * root-relative script and style URLs, and the chunks Turbopack loads at
 * runtime, at Langfuse. Those assets are public and served with CORS headers
 * (next.config.mjs). A `<base>` would be shorter, but hosts default to
 * `base-uri 'self'`.
 */
const WIDGET_PAGE = "mcp-apps/widget";

const UNAVAILABLE = `<!doctype html><html><body><p style="font-family:sans-serif;color:#888">The Langfuse widget could not be loaded.</p></body></html>`;

/** The origin the page and, without an asset prefix, its assets load from. */
const appOrigin = () => getProductBaseUrl().origin;

/**
 * Origins the host's iframe CSP must allow. MCP Apps hosts deny everything
 * not declared here.
 */
const widgetCsp = () => ({
  resourceDomains: [
    ...new Set([appOrigin(), env.NEXT_PUBLIC_ASSET_PREFIX ?? appOrigin()]),
  ],
  // Data arrives in the tool result; only the dev server's HMR socket
  // connects back.
  connectDomains:
    env.NODE_ENV === "development" ? [appOrigin().replace(/^http/, "ws")] : [],
});

/**
 * Runs before Next.js does:
 * - Turbopack loads chunks from `TURBOPACK_CHUNK_BASE_PATH` when set, else
 *   relative to the document, which here is the host's.
 * - The App Router syncs its URL into history, which a sandboxed frame may
 *   refuse; the widget never navigates, so that is ignored.
 * - In development, the HMR socket would connect to the host's origin.
 */
const bootstrapScript = (chunkBasePath?: string) => `<script>
(function () {
  ${chunkBasePath ? `self.TURBOPACK_CHUNK_BASE_PATH = ${JSON.stringify(chunkBasePath)};` : ""}
  ["pushState", "replaceState"].forEach(function (method) {
    var original = history[method].bind(history);
    history[method] = function () {
      try { return original.apply(null, arguments); } catch (error) {}
    };
  });
  ${
    env.NODE_ENV === "development"
      ? `var app = new URL(${JSON.stringify(appOrigin())});
  var NativeWebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    var target = new URL(String(url), location.href);
    if (target.host === location.host) {
      target.protocol = app.protocol === "https:" ? "wss:" : "ws:";
      target.host = app.host;
    }
    return new NativeWebSocket(target.href, protocols);
  };
  window.WebSocket.prototype = NativeWebSocket.prototype;
  Object.assign(window.WebSocket, NativeWebSocket);`
      : ""
  }
})();
</script>`;

/**
 * Makes the page load from Langfuse inside the host's iframe: every quoted
 * root-relative `/_next/` URL, in tags and in the inline RSC payload that
 * names the chunks to load, becomes absolute.
 */
const toAppDocument = (html: string) => {
  if (env.NEXT_PUBLIC_ASSET_PREFIX) {
    // Asset URLs are absolute already.
    return html.replace(/<head([^>]*)>/i, `<head$1>${bootstrapScript()}`);
  }
  const assets = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/_next/`;
  const absolute = `${appOrigin()}${assets}`;
  return (
    html
      .replace(/<head([^>]*)>/i, `<head$1>${bootstrapScript(absolute)}`)
      // Also matches the escaped quotes of strings inside the RSC payload.
      .replaceAll(`"${assets}`, `"${absolute}`)
  );
};

let cachedPage: string | undefined;

const loadPage = async (): Promise<string> => {
  if (cachedPage) return cachedPage;
  const url = new URL(WIDGET_PAGE, getProductBaseUrl());
  try {
    const response = await fetch(url, {
      headers: { accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const page = toAppDocument(await response.text());
    // The page only changes on deploy; in development every read refetches.
    if (env.NODE_ENV === "production") cachedPage = page;
    return page;
  } catch (error) {
    logger.error("MCP App page could not be loaded", { error, url: `${url}` });
    return UNAVAILABLE;
  }
};

const RESOURCE = {
  uri: WIDGET_APP_RESOURCE_URI,
  name: "Langfuse widget",
  description:
    "Chart for renderWidget results (MCP App). Hosts render it inline next to the tool call.",
  mimeType: MCP_APP_MIME_TYPE,
};

const resourceMeta = () => ({
  ui: { prefersBorder: false, csp: widgetCsp() },
});

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
