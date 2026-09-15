import { useEntitlementLimit } from "@/src/features/entitlements";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

/** Owns evaluator alert permissions, linked-alert loading, and creation limits. */
export function useEvaluatorAlerts(
  params:
    | { scope: "evaluator"; projectId: string; evaluatorId: string | null }
    | { scope: "allEvaluators"; projectId: string },
) {
  const canRead = useHasProjectAccess({
    projectId: params.projectId,
    scope: "alerts:read",
  });
  const canCreate = useHasProjectAccess({
    projectId: params.projectId,
    scope: "alerts:CUD",
  });
  const monitorEntitlementLimit = useEntitlementLimit("monitor-count");
  const evaluatorId =
    params.scope === "evaluator" ? (params.evaluatorId ?? "") : "";

  const evaluatorAlerts = api.monitors.linkedEvaluatorAlerts.useQuery(
    { projectId: params.projectId, evaluatorId },
    {
      enabled: Boolean(params.scope === "evaluator" && evaluatorId && canRead),
    },
  );
  const aggregateCostAlerts =
    api.monitors.linkedAllEvaluatorSpendAlerts.useQuery(
      { projectId: params.projectId },
      {
        enabled: Boolean(
          params.scope === "allEvaluators" && params.projectId && canRead,
        ),
      },
    );
  const monitorCount = api.monitors.count.useQuery(
    { projectId: params.projectId },
    { enabled: Boolean(params.projectId && canCreate) },
  );
  const limitReached =
    typeof monitorEntitlementLimit === "number" &&
    (monitorCount.data?.count ?? 0) >= monitorEntitlementLimit;
  const linkedAlerts =
    params.scope === "evaluator" ? evaluatorAlerts : aggregateCostAlerts;

  return {
    connectedAlerts: linkedAlerts.data?.data ?? [],
    hasMore: linkedAlerts.data?.hasMore ?? false,
    isLoading: canRead && linkedAlerts.isPending,
    canRead,
    canCreate,
    limitReached,
  };
}
