import { useEffect, useRef } from "react";
import { type QueryValidationResult } from "@langfuse/shared/query";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

type WidgetHighCardinalityErrorSurface =
  | "create_editor"
  | "edit_editor"
  | "dashboard_tile";

export function useCaptureWidgetHighCardinalityError({
  validation,
  surface,
  chartType,
  isV4,
}: {
  validation: QueryValidationResult;
  surface: WidgetHighCardinalityErrorSurface;
  chartType?: DashboardWidgetChartType;
  isV4: boolean;
}) {
  const capture = usePostHogClientCapture();
  const lastCapturedEncounter = useRef<string | null>(null);

  useEffect(() => {
    const error = validation.valid ? undefined : validation.highCardinality;
    if (!error) {
      lastCapturedEncounter.current = null;
      return;
    }
    if (!chartType) return;

    const properties = {
      surface,
      chartType,
      isV4,
      validationCode: error.code,
      highCardinalityDimensions: error.dimensions,
    };
    const encounter = JSON.stringify(properties);
    if (lastCapturedEncounter.current === encounter) return;
    lastCapturedEncounter.current = encounter;

    capture("dashboard:widget_high_cardinality_error", properties);
  }, [capture, chartType, isV4, surface, validation]);
}
