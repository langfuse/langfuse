/**
 * Styles page of the `renderWidget` MCP App. Hosts never load it: the MCP
 * server reads the CSS Next.js compiles for it (globals plus view overrides,
 * see ../layout.tsx) and inlines that into `ui://langfuse/widget.html`.
 */
export const metadata = { title: "Langfuse widget styles" };

export { McpWidgetStylesPage as default } from "@/src/features/mcp/views/widget/McpWidgetStylesPage";
