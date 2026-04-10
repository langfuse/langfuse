export const V4_BETA_JOINED_POST_CUT_OFF_CUTOFF = new Date(
  "2026-04-13T08:00:00.000Z",
);

export function isJoinedPostCutOffForOrganizationCreatedAts(
  organizationCreatedAts: Date[],
): boolean {
  if (organizationCreatedAts.length === 0) {
    return false;
  }

  // Use the oldest org the user belongs to so existing users are not
  // reclassified as "new" just because they later join or create a newer org.
  const oldestOrganizationCreatedAt = organizationCreatedAts.reduce(
    (oldest, createdAt) => (createdAt < oldest ? createdAt : oldest),
    organizationCreatedAts[0],
  );

  return oldestOrganizationCreatedAt >= V4_BETA_JOINED_POST_CUT_OFF_CUTOFF;
}

export function resolveV4BetaState({
  organizationCreatedAts,
  storedV4BetaEnabled,
}: {
  organizationCreatedAts: Date[];
  storedV4BetaEnabled: boolean;
}) {
  const joinedPostCutOff = isJoinedPostCutOffForOrganizationCreatedAts(
    organizationCreatedAts,
  );

  return {
    joinedPostCutOff,
    isEnabled: storedV4BetaEnabled || joinedPostCutOff,
  };
}

export function resolveV4BetaMutationState({
  organizationCreatedAts,
  requestedV4BetaEnabled,
}: {
  organizationCreatedAts: Date[];
  requestedV4BetaEnabled: boolean;
}) {
  const v4BetaState = resolveV4BetaState({
    organizationCreatedAts,
    storedV4BetaEnabled: requestedV4BetaEnabled,
  });

  return {
    ...v4BetaState,
    shouldPersistRequestedState: !(
      v4BetaState.joinedPostCutOff && requestedV4BetaEnabled === false
    ),
  };
}
