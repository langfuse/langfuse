import { env } from "@/src/env.mjs";
import { isRegionProduction } from "@/src/features/organizations/cloudRegions";
import { getServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";

/**
 * Records a trace or session made public or private. Metadata only, sent from
 * production Cloud regions; never throws or waits.
 */
export function capturePublicShareChanged(
  userId: string,
  properties: { kind: "trace" | "session"; isPublic: boolean },
) {
  const region = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  if (!region || !isRegionProduction(region)) return;
  try {
    getServerPosthog().capture({
      distinctId: userId,
      event: "public_share:changed",
      properties,
    });
  } catch {}
}
