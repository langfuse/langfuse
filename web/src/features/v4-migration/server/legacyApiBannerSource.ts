import { env } from "@/src/env.mjs";
import {
  getLegacyApiShutdownStatus,
  LEGACY_API_SHUTDOWN_SCHEDULE,
  type LegacyApiBrownoutWindow,
  type LegacyApiShutdownPhase,
  type LegacyApiShutdownSchedule,
} from "@/src/features/public-api/server/legacyApiShutdownSchedule";

/**
 * Where the legacy API shutdown top banner gets its schedule and per-org
 * exemptions. The banner only consumes `LegacyApiBannerState`, so a runtime
 * brownout switch or a per-organization allowlist can replace this source
 * without touching the banner.
 */
export type LegacyApiBannerSource = {
  getSchedule: () =>
    | LegacyApiShutdownSchedule
    | Promise<LegacyApiShutdownSchedule>;
  isOrganizationExempt: (orgId: string) => boolean | Promise<boolean>;
};

/** createStaticLegacyApiBannerSource serves the hardcoded schedule and a fixed exempt-org list. */
export function createStaticLegacyApiBannerSource(
  exemptOrgIds: readonly string[],
): LegacyApiBannerSource {
  const exempt = new Set(exemptOrgIds);
  return {
    getSchedule: () => LEGACY_API_SHUTDOWN_SCHEDULE,
    isOrganizationExempt: (orgId) => exempt.has(orgId),
  };
}

export const legacyApiBannerSource = createStaticLegacyApiBannerSource(
  env.LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS,
);

type LegacyApiBannerPhase = "hidden" | LegacyApiShutdownPhase;

export type LegacyApiBannerState = {
  phase: LegacyApiBannerPhase;
  exempt: boolean;
  /** Server clock the phase was computed with. */
  serverNow: Date;
  evalsExportsStopAt: Date;
  fullCutAt: Date;
  activeWindow: LegacyApiBrownoutWindow | null;
  nextWindow: LegacyApiBrownoutWindow | null;
};

/** getLegacyApiBannerState resolves the org's banner phase; self-hosted and exempt orgs are hidden. */
export async function getLegacyApiBannerState(params: {
  source: LegacyApiBannerSource;
  orgId: string;
  now: Date;
  isLangfuseCloud: boolean;
}): Promise<LegacyApiBannerState> {
  const { source, orgId, now, isLangfuseCloud } = params;
  const [schedule, exempt] = await Promise.all([
    source.getSchedule(),
    source.isOrganizationExempt(orgId),
  ]);
  const status = getLegacyApiShutdownStatus(schedule, now);

  return {
    phase: !isLangfuseCloud || exempt ? "hidden" : status.phase,
    exempt,
    serverNow: now,
    evalsExportsStopAt: schedule.evalsExportsStopAt,
    fullCutAt: schedule.fullCutAt,
    activeWindow: status.activeWindow,
    nextWindow: status.nextWindow,
  };
}

/**
 * QA time travel (`?v4BannerNow=<ISO>`): honored only for Langfuse admins and
 * on PR preview deployments, which run on synthetic data.
 */
export function resolveLegacyApiBannerNow(params: {
  nowOverride: string | undefined;
  isAdmin: boolean;
  isPreviewDeployment: boolean;
  now: Date;
}): Date {
  const { nowOverride, isAdmin, isPreviewDeployment, now } = params;
  if (!nowOverride || !(isAdmin || isPreviewDeployment)) return now;
  const override = new Date(nowOverride);
  return Number.isNaN(override.getTime()) ? now : override;
}
