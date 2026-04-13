export const V4_JOINED_POST_CUTOFF_AT = new Date("2026-04-13T08:00:00.000Z");

export function isV4JoinedPostCutoff({
  organizationCreatedAts,
  userCreatedAt,
}: {
  organizationCreatedAts: Date[];
  userCreatedAt?: Date | null;
}): boolean {
  if (organizationCreatedAts.length === 0) {
    return userCreatedAt != null && userCreatedAt >= V4_JOINED_POST_CUTOFF_AT;
  }

  // Use the oldest org the user belongs to so existing users are not
  // reclassified as "new" just because they later join or create a newer org.
  const oldestOrganizationCreatedAt = organizationCreatedAts.reduce(
    (oldest, createdAt) => (createdAt < oldest ? createdAt : oldest),
    organizationCreatedAts[0],
  );

  return oldestOrganizationCreatedAt >= V4_JOINED_POST_CUTOFF_AT;
}

export function resolveV4BetaRollout({
  organizationCreatedAts,
  userPreferenceEnabled,
  userCreatedAt,
}: {
  organizationCreatedAts: Date[];
  userPreferenceEnabled: boolean;
  userCreatedAt?: Date | null;
}) {
  const v4JoinedPostCutoff = isV4JoinedPostCutoff({
    organizationCreatedAts,
    userCreatedAt,
  });

  return {
    v4JoinedPostCutoff,
    effectiveEnabled: userPreferenceEnabled || v4JoinedPostCutoff,
    canPersistUserChoice: !v4JoinedPostCutoff,
    canShowToggle: !v4JoinedPostCutoff,
  };
}
