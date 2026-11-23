"use client";

import dynamic from "next/dynamic";

// The MCP Apps SDK reads the document and talks to the host window, so the
// view renders in the browser only.
const WidgetApp = dynamic(
  () => import("./WidgetApp").then((module) => module.WidgetApp),
  { ssr: false },
);

/** Page content of the `renderWidget` MCP App (`/mcp-apps/widget`). */
export function McpWidgetPage() {
  return <WidgetApp />;
}
