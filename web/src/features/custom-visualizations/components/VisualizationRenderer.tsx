"use client";

import type { ReactNode } from "react";

import { CustomUiRenderer } from "@/src/features/custom-visualizations/runtime";
import type {
  VisualizationDataEnvelope,
  VisualizationDefinition,
} from "../types";

/**
 * Product-level rendering boundary. Matching, placement, and versioning stay
 * outside the runtime; the runtime receives only a pinned catalog spec and a
 * normalized data envelope.
 */
export function VisualizationRenderer({
  definition,
  data,
  fallback = null,
  showDiagnostics = false,
}: {
  definition: VisualizationDefinition;
  data: VisualizationDataEnvelope;
  fallback?: ReactNode;
  showDiagnostics?: boolean;
}) {
  return (
    <CustomUiRenderer
      spec={definition.spec}
      input={data}
      fallback={fallback}
      showDiagnostics={showDiagnostics}
    />
  );
}
