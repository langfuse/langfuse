import { api } from "@/src/utils/api";

/** Refetches guardrail lists and flagged-request chart after any guardrail mutation. */
export function useInvalidateGatewayGuardrails(organizationId: string) {
  const utils = api.useUtils();
  return () =>
    Promise.all([
      utils.aiGateway.listGuardrails.invalidate({ orgId: organizationId }),
      utils.aiGateway.listMatchingGuardrails.invalidate({
        orgId: organizationId,
      }),
      utils.aiGateway.getGuardrailFlaggedTimeSeries.invalidate({
        orgId: organizationId,
      }),
    ]);
}
