import { api } from "@/src/utils/api";

/** Refetches guardrail lists and flagged-request chart after any guardrail mutation. */
export function useInvalidateGatewayGuardrails(organizationId: string) {
  const utils = api.useUtils();
  return () =>
    Promise.all([
      utils.aiGateway.guardrails.list.invalidate({ orgId: organizationId }),
      utils.aiGateway.guardrails.listMatching.invalidate({
        orgId: organizationId,
      }),
      utils.aiGateway.guardrails.getFlaggedTimeSeries.invalidate({
        orgId: organizationId,
      }),
    ]);
}
