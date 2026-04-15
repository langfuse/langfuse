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

export function canToggleV4(context: V4RolloutContext): boolean {
  return !shouldAutoEnableV4(context);
}
