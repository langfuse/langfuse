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
 * (enriched-unavailable, legacy-writes-disabled) still reject it — it could
 * not export — while the Cloud date cutoffs grandfather it.
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
  // Capability-only check: dropping the creation dates disables the Cloud
  // date cutoffs, which gate newly chosen values only.
  const validation = validateExportSource(persistedExportSource, {
    isCloud: ctx.isCloud,
    enrichedAvailable: ctx.enrichedAvailable,
    legacyWritesActive: ctx.legacyWritesActive,
  });
  if (!validation.ok) throw new InvalidRequestError(validation.message);
}
