"use client";

import { startSpan } from "@sentry/nextjs";
import { reportError } from "@/src/utils/reportError";
import type {
  CustomUiPlanFailureCode,
  CustomUiRuntimeDiagnostics,
} from "./compileRenderPlan";

type CustomUiPerformancePhase =
  | "queue_wait"
  | "prepare"
  | "first_render"
  | "deferred_render";

const structuralAttributes = (diagnostics: CustomUiRuntimeDiagnostics) => ({
  "custom_ui.node_count": diagnostics.nodeCount,
  "custom_ui.max_depth": diagnostics.maxDepth,
  "custom_ui.deferred_count": diagnostics.deferredCount,
  "custom_ui.repeat_region_count": diagnostics.repeatRegionCount,
  "custom_ui.bounded_repeat_item_count": diagnostics.boundedRepeatItemCount,
  "custom_ui.truncated_repeat_item_count": diagnostics.truncatedRepeatItemCount,
  "custom_ui.spec_bytes": diagnostics.specByteLength,
});

/** Record only bounded structural measurements; no spec paths or trace data. */
export function recordCustomUiPerformance(
  phase: CustomUiPerformancePhase,
  durationMs: number,
  diagnostics: CustomUiRuntimeDiagnostics,
): void {
  startSpan(
    {
      name: `custom_ui.${phase}`,
      op: "ui.custom_ui",
      attributes: {
        ...structuralAttributes(diagnostics),
        "custom_ui.duration_ms": Math.max(0, durationMs),
      },
    },
    () => undefined,
  );
}

export function reportInvalidCustomUi(code: CustomUiPlanFailureCode): void {
  reportError(new Error("Stored Custom UI failed runtime validation"), {
    area: "custom-ui-renderer",
    tags: { stage: "validate", failure_code: code },
    warnMessage: "Stored Custom UI failed runtime validation",
  });
}

export function reportCustomUiRootFailure(): void {
  reportError(new Error("Custom UI root failed to render"), {
    area: "custom-ui-renderer",
    tags: { stage: "render" },
    warnMessage: "Custom UI root failed to render",
  });
}
