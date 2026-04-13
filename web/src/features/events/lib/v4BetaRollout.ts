export const V4_DEFAULT_ENABLED_FROM_AT = new Date("2026-04-13T08:00:00.000Z");

type RolloutOrganization = {
  id: string;
  createdAt: Date;
};

type V4BetaRolloutContext = {
  organizations: RolloutOrganization[];
  userCreatedAt?: Date | null;
  excludedOrganizationIds?: string[];
  rolloutEnabled?: boolean;
};

export function isV4RolloutManaged({
  organizations,
  userCreatedAt,
  excludedOrganizationIds = [],
  rolloutEnabled = true,
}: V4BetaRolloutContext): boolean {
  if (!rolloutEnabled) {
    return false;
  }

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

export function canToggleV4Beta(context: V4BetaRolloutContext): boolean {
  return !isV4RolloutManaged(context);
}
