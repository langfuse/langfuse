import {
  type AnalyticsIntegrationExportSource,
  LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  type BlobExportWriteMode,
  type ExportSourceContext,
} from "@langfuse/shared";
import { useMemo } from "react";

import {
  buildExportSourceContext,
  getDefaultExportSource,
  getExportSourceOptions,
  shouldShowExportSourceField,
  type SelectableExportSourceOption,
} from "@/src/features/analytics-integrations/exportSource";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

/**
 * Read-time export-source handling for the PostHog and Mixpanel settings pages,
 * which derive all four values identically. The client counterpart of
 * ./server/analyticsExportSource.ts — keeping both integrations on one
 * derivation is what stops the two pages diverging when the policy inputs
 * change. Policy itself lives in export-source-policy.ts.
 */
export function useAnalyticsExportSource({
  writeMode,
  projectCreatedAt,
  persisted,
  integrationCreatedAt,
}: {
  writeMode: BlobExportWriteMode;
  // Raw ISO strings, not Dates: a Date built in the caller's JSX would be a new
  // reference on every render and would defeat the memo below.
  projectCreatedAt: string;
  persisted: AnalyticsIntegrationExportSource | null | undefined;
  integrationCreatedAt: string | Date | null | undefined;
}): {
  exportSourceCtx: ExportSourceContext;
  exportSourceOptions: SelectableExportSourceOption[];
  showExportSourceField: boolean;
  defaultExportSource: AnalyticsIntegrationExportSource;
} {
  const { isBetaEnabled } = useV4Beta();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const createdAtKey =
    integrationCreatedAt instanceof Date
      ? integrationCreatedAt.toISOString()
      : integrationCreatedAt;

  const exportSourceCtx = useMemo(
    () => ({
      ...buildExportSourceContext({
        writeMode,
        isCloud: isLangfuseCloud,
        projectCreatedAt: new Date(projectCreatedAt),
        integrationCreatedAt: createdAtKey ? new Date(createdAtKey) : null,
      }),
      exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF,
    }),
    [writeMode, isLangfuseCloud, projectCreatedAt, createdAtKey],
  );

  const exportSourceOptions = getExportSourceOptions(
    persisted ?? null,
    exportSourceCtx,
  );

  return {
    exportSourceCtx,
    exportSourceOptions,
    showExportSourceField: shouldShowExportSourceField({
      persisted,
      ctx: exportSourceCtx,
      isBetaEnabled,
      options: exportSourceOptions,
    }),
    defaultExportSource: getDefaultExportSource({
      persisted,
      ctx: exportSourceCtx,
      isBetaEnabled,
    }),
  };
}
