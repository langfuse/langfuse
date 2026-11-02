import { api } from "@/src/utils/api";

export type GatewayLaunchState = "setup" | "ask-admin" | "get-key";

export type GatewayLaunchCandidate = {
  organizationId: string;
  organizationName: string;
  canManage: boolean;
};

export type GatewayLaunchTarget = {
  organizationId: string;
  state: GatewayLaunchState;
  /** Orgs the user can set up from the dialog; a picker shows when several. */
  setupOptions: ReadonlyArray<GatewayLaunchCandidate>;
};

/**
 * Picks the org the launch banner speaks for: an unconfigured org the user can
 * set up, else a configured org where a member has no key yet, else an
 * unconfigured org where they ask an admin.
 */
export function useGatewayLaunchTarget(
  candidates: ReadonlyArray<GatewayLaunchCandidate>,
): GatewayLaunchTarget | null {
  const statuses = api.useQueries((t) =>
    candidates.map((candidate) =>
      t.aiGateway.getSetupStatus({ orgId: candidate.organizationId }),
    ),
  );
  // Members only see their own keys, so one row answers "has a key".
  const ownKeys = api.useQueries((t) =>
    candidates.map((candidate, index) =>
      t.aiGateway.listApiKeys(
        { orgId: candidate.organizationId, page: 0, limit: 1 },
        {
          enabled:
            !candidate.canManage &&
            statuses[index]?.data?.isConfigured === true,
        },
      ),
    ),
  );
  if (!isLaunchTargetSettled(candidates, statuses, ownKeys)) return null;
  const unconfigured = candidates.filter(
    (_, index) => statuses[index]?.data?.isConfigured === false,
  );
  const setupOptions = unconfigured.filter((candidate) => candidate.canManage);
  if (setupOptions[0]) {
    return {
      organizationId: setupOptions[0].organizationId,
      state: "setup",
      setupOptions,
    };
  }
  const keyTarget = candidates.find(
    (candidate, index) =>
      !candidate.canManage &&
      statuses[index]?.data?.isConfigured === true &&
      ownKeys[index]?.data?.totalCount === 0,
  );
  if (keyTarget) {
    return {
      organizationId: keyTarget.organizationId,
      state: "get-key",
      setupOptions: [],
    };
  }
  if (!unconfigured[0]) return null;
  return {
    organizationId: unconfigured[0].organizationId,
    state: "ask-admin",
    setupOptions: [],
  };
}

/**
 * A partial answer picks a different org or state than the final one, so the
 * banner would swap while queries settle.
 */
function isLaunchTargetSettled(
  candidates: ReadonlyArray<GatewayLaunchCandidate>,
  statuses: ReadonlyArray<SettleQuery<{ isConfigured: boolean }>>,
  ownKeys: ReadonlyArray<SettleQuery<unknown>>,
) {
  // `isFetched` rather than `isError`: refetching a failed query resets its
  // error, which would hide the banner on every window focus.
  return candidates.every((candidate, index) => {
    const status = statuses[index];
    if (status?.isFetched !== true) return false;
    if (candidate.canManage || status.data?.isConfigured !== true) return true;
    return ownKeys[index]?.isFetched === true;
  });
}

type SettleQuery<TData> = { data?: TData; isFetched: boolean } | undefined;
