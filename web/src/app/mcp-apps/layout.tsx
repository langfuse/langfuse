import "@/src/styles/globals.css";
import "@/src/features/mcp/views/widget/view.css";

/** MCP App styles: the MCP server inlines the CSS Next.js builds for these pages. */
export default function McpAppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
