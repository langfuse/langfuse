export const V4_DEFAULT_ENABLED_FROM_AT = new Date("2026-04-14T13:00:00.000Z");

type RolloutOrganization = {
  id: string;
  createdAt: Date;
};

type V4RolloutContext = {
  organizations: RolloutOrganization[];
  userCreatedAt?: Date | null;
  excludedOrganizationIds?: string[];
};

export function shouldAutoEnableV4({
  organizations,
  userCreatedAt,
  excludedOrganizationIds = [],
}: V4RolloutContext): boolean {
  const excludedOrganizationIdSet = new Set(excludedOrganizationIds);
  const rolloutRelevantOrganizations = organizations.filter(
    (organization) => !excludedOrganizationIdSet.has(organization.id),
  );

  if (rolloutRelevantOrganizations.length === 0) {
    return userCreatedAt != null && userCreatedAt >= V4_DEFAULT_ENABLED_FROM_AT;
  }

  // Use the oldest rollout-relevant org the user belongs to so existing users
  // are not reclassified as "new" just because they later join or create a
  // newer org. Excluded system orgs like the demo org do not influence rollout.
  const oldestOrganizationCreatedAt = rolloutRelevantOrganizations.reduce(
    (oldest, organization) =>
      organization.createdAt < oldest ? organization.createdAt : oldest,
    rolloutRelevantOrganizations[0].createdAt,
  );

  return oldestOrganizationCreatedAt >= V4_DEFAULT_ENABLED_FROM_AT;
}

type CanToggleV4Options = {
  // Langfuse Cloud staff superusers (the instance-level `User.admin` flag, not a
  // customer's org/project ADMIN role) need the toggle on any tenant's project
  // so they can reproduce v3/v4 behavior — even when their own account is new
  // enough that the date-based rollout would otherwise auto-enable and lock it.
  isLangfuseCloudAdmin?: boolean;
};

export function canToggleV4(
  context: V4RolloutContext,
  options: CanToggleV4Options = {},
): boolean {
  if (process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV") {
    return true;
  }

  if (options.isLangfuseCloudAdmin) {
    return true;
  }

  return !shouldAutoEnableV4(context);
}

type V4UpgradeUiAvailabilityContext = {
  isLangfuseCloud: boolean;
  v4WriteMode: "legacy" | "dual" | "events_only";
  // Whether a dual-mode deployment lets anyone read through the v4 events
  // tables: Cloud always does, self-hosted only with
  // LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN=true.
  dualPreviewAvailable: boolean;
};

/**
 * Whether this deployment shows the v4 migration/upgrade UI (sidebar "Action
 * required" pill, the per-project chips and banner on the organization
 * overview, the migration panel and status page) by default.
 *
 * This is a different question from `v4BetaEnabled`: the migration UI guides
 * users through work that is still pending, so it deliberately does not
 * require the user to have opted into v4 reads first — the panel is where that
 * opt-in is offered.
 *
 * - `legacy`: off. The events tables the migration surfaces read are not
 *   written, so every readiness check would come back unknown.
 * - `dual`: on, but self-hosted only once the operator set ALLOW_PREVIEW_OPT_IN.
 *   Both table sets are written, so there is a real migration to guide — but
 *   without the opt-in nobody on the deployment can move onto the v4 read path,
 *   which makes every call to action a dead end.
 * - `events_only`: Cloud only. Self-hosted the migration is already over — the
 *   legacy public API routes 404, legacy evaluators are hidden and the legacy
 *   analytics integrations are no-ops, so nothing is left to act on. On Cloud we
 *   keep it so users still get an explanation once the region flips.
 *
 * Per-project exceptions are handled downstream by LANGFUSE_FORCE_V3_EXPERIENCE.
 */
export function isV4UpgradeUiAvailable({
  isLangfuseCloud,
  v4WriteMode,
  dualPreviewAvailable,
}: V4UpgradeUiAvailabilityContext): boolean {
  switch (v4WriteMode) {
    case "legacy":
      return false;
    case "dual":
      return dualPreviewAvailable;
    case "events_only":
      return isLangfuseCloud;
  }
}
