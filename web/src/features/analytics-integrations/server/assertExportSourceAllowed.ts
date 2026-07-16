import {
  type ExportSourceContext,
  InvalidRequestError,
  validateExportSource,
} from "@langfuse/shared";
import { type AnalyticsIntegrationExportSource } from "@langfuse/shared/src/db";

/**
 * Write-time export-source gate shared by the blob-storage tRPC + REST upserts
 * and the PostHog/Mixpanel routers. Thin adapter over validateExportSource —
 * see export-source-policy.ts for the policy and its rationale.
 *
 * An explicitly requested source must pass every check. When the request omits
 * the source, the persisted one stays in effect: deployment-capability reasons
 * still reject it (it could not export), while the Cloud date cutoffs
 * grandfather it — they gate newly chosen values only.
 */
export function assertExportSourceAllowed({
  nextExportSource,
  persistedExportSource,
  ctx,
}: {
  nextExportSource: AnalyticsIntegrationExportSource | undefined;
  persistedExportSource?: AnalyticsIntegrationExportSource | null;
  ctx: ExportSourceContext;
}): void {
  if (nextExportSource) {
    const validation = validateExportSource(nextExportSource, ctx);
    if (!validation.ok) throw new InvalidRequestError(validation.message);
    return;
  }
  if (!persistedExportSource) return;
  const validation = validateExportSource(persistedExportSource, ctx);
  if (!validation.ok && validation.reason !== "cloud-cutoff") {
    throw new InvalidRequestError(validation.message);
  }
}
