/**
 * The `renderWidget` MCP App. The MCP server returns this page's HTML as
 * `ui://langfuse/widget.html`; hosts render it in a sandboxed iframe that
 * loads the page's scripts and styles from Langfuse.
 */
export const metadata = { title: "Langfuse widget" };

export { McpWidgetPage as default } from "@/src/features/mcp/views/widget/McpWidgetPage";
