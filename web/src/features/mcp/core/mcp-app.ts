/**
 * MCP Apps support (https://github.com/modelcontextprotocol/ext-apps).
 *
 * An MCP App is a tool whose definition points at a `ui://` resource holding
 * an HTML document. Hosts that support the extension render that document in
 * a sandboxed iframe next to the tool call and forward the tool result to it
 * over postMessage. Hosts without support ignore the metadata and show the
 * text content, so every app tool still answers in text.
 */

/** MIME type hosts look for on `ui://` resources. */
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

export type McpAppToolUi = {
  /** `ui://` resource rendered for this tool's results. */
  resourceUri: `ui://${string}`;
};

/**
 * Tool `_meta` announcing the UI resource. The flat `ui/resourceUri` key is
 * the older spelling that some hosts still read.
 */
export const toMcpAppToolMeta = (ui: McpAppToolUi) => ({
  ui: { resourceUri: ui.resourceUri },
  "ui/resourceUri": ui.resourceUri,
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
