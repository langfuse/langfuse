/**
 * Entry point of the `renderWidget` MCP App view, bundled by
 * scripts/build-mcp-apps.mjs and inlined into `ui://langfuse/widget.html`.
 */
import { createRoot } from "react-dom/client";
import { WidgetApp } from "./WidgetApp";

const container = document.getElementById("root");
if (container) createRoot(container).render(<WidgetApp />);
