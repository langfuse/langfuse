"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

const apiReferenceConfiguration = {
  url: "../generated/api/openapi.yml",
  agent: { disabled: true },
  mcp: { disabled: true },
  hideClientButton: true,
  hideTestRequestButton: true,
} as const;

export function ApiReference() {
  return <ApiReferenceReact configuration={apiReferenceConfiguration} />;
}
