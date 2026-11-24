import {
  EXTENSION_ID,
  getUiCapability,
  RESOURCE_MIME_TYPE,
  RESOURCE_URI_META_KEY,
} from "@modelcontextprotocol/ext-apps/server";
import {
  CLIENT_CAPABILITIES_META_KEY,
  type ClientCapabilities,
} from "@modelcontextprotocol/server";

/**
 * MCP Apps support (https://github.com/modelcontextprotocol/ext-apps).
 *
 * An MCP App is a tool whose definition points at a `ui://` resource holding
 * an HTML document. Hosts that support the extension render that document in
 * a sandboxed iframe next to the tool call and forward the tool result to it
 * over postMessage. Hosts without support ignore the metadata and show the
 * text content, so every app tool still answers in text.
 */

/** Server capability `extensions` entry announcing MCP Apps support. */
export const MCP_APPS_EXTENSION = { [EXTENSION_ID]: {} };

/**
 * Whether app tools and their `ui://` resources are offered to the client
 * sending a request. Only 2026-07-28 requests declare client capabilities
 * (in their `_meta` envelope); 2025-era clients declare theirs once in
 * `initialize`, which this stateless endpoint does not keep. So only a client
 * that declared capabilities without the MCP Apps extension is known not to
 * render apps; others keep app tools, which also answer in text.
 */
export const clientMayRenderApps = (ctx: { mcpReq: { envelope?: object } }) => {
  const capabilities = (
    ctx.mcpReq.envelope as
      | Record<string, ClientCapabilities | undefined>
      | undefined
  )?.[CLIENT_CAPABILITIES_META_KEY];
  return (
    capabilities === undefined ||
    (getUiCapability(capabilities)?.mimeTypes?.includes(RESOURCE_MIME_TYPE) ??
      false)
  );
};

/** Whether a tool definition renders its results with a `ui://` resource. */
export const isAppTool = (definition: {
  _meta?: { ui?: { resourceUri?: string } };
}) => definition._meta?.ui?.resourceUri !== undefined;

export type McpAppToolUi = {
  /** `ui://` resource rendered for this tool's results. */
  resourceUri: `ui://${string}`;
};

/**
 * Tool `_meta` announcing the UI resource. Like the SDK's `registerAppTool`,
 * it also sets the flat `ui/resourceUri` key that older hosts read.
 */
export const toMcpAppToolMeta = (ui: McpAppToolUi) => ({
  ui: { resourceUri: ui.resourceUri },
  [RESOURCE_URI_META_KEY]: ui.resourceUri,
});

const APP_TOOL_RESULT = Symbol("mcp.appToolResult");

/**
 * A tool result with text for the model and `_meta` for the app. Hosts hand
 * result `_meta` to the app's iframe but not to the model.
 */
export type AppToolResult = {
  [APP_TOOL_RESULT]: true;
  text: string;
  meta: Record<string, unknown>;
};

export const appToolResult = (params: {
  text: string;
  meta: Record<string, unknown>;
}): AppToolResult => ({ [APP_TOOL_RESULT]: true, ...params });

export const isAppToolResult = (value: unknown): value is AppToolResult =>
  typeof value === "object" && value !== null && APP_TOOL_RESULT in value;
