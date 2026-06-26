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
