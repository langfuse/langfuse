export const V4_DEFAULT_ENABLED_FROM_AT = new Date("2026-04-13T08:00:00.000Z");

type V4BetaRolloutContext = {
  organizationCreatedAts: Date[];
  userCreatedAt?: Date | null;
};

export function isV4RolloutManaged({
  organizationCreatedAts,
  userCreatedAt,
}: V4BetaRolloutContext): boolean {
  if (organizationCreatedAts.length === 0) {
    return userCreatedAt != null && userCreatedAt >= V4_DEFAULT_ENABLED_FROM_AT;
  }

  // Use the oldest org the user belongs to so existing users are not
  // reclassified as "new" just because they later join or create a newer org.
  const oldestOrganizationCreatedAt = organizationCreatedAts.reduce(
    (oldest, createdAt) => (createdAt < oldest ? createdAt : oldest),
    organizationCreatedAts[0],
  );

  return oldestOrganizationCreatedAt >= V4_DEFAULT_ENABLED_FROM_AT;
}

export function canToggleV4Beta(context: V4BetaRolloutContext): boolean {
  return !isV4RolloutManaged(context);
}
