"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

const apiReferenceConfiguration = {
  url: "../generated/api/openapi.yml",
  agent: { disabled: true },
  mcp: { disabled: true },
  hideClientButton: true,
  withDefaultFonts: false,
  customCss: `
    :root {
      --scalar-font: ui-sans-serif, system-ui, sans-serif;
      --scalar-font-code: ui-monospace, monospace;
    }
  `,
} as const;

export function ApiReference() {
  return <ApiReferenceReact configuration={apiReferenceConfiguration} />;
}
