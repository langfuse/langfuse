import { useInvalidateGatewayGuardrails } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayGuardrails";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
  type RouterInputs,
} from "@/src/utils/api";

export type GatewayGuardrailDeleteTargetInput =
  RouterInputs["aiGateway"]["guardrails"]["delete"]["target"];

export function useDeleteGatewayGuardrails(organizationId: string) {
  const invalidateGuardrails = useInvalidateGatewayGuardrails(organizationId);
  const capture = usePostHogClientCapture();
  const mutation = api.aiGateway.guardrails.delete.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-guardrails"),
  });

  const deleteGuardrails = async (
    target: GatewayGuardrailDeleteTargetInput,
    options?: { isBulk?: boolean },
  ) => {
    try {
      const result = await mutation.mutateAsync({
        orgId: organizationId,
        target,
      });
      if (result.deletedCount > 0) {
        capture("ai_gateway:guardrail_deleted", {
          orgId: organizationId,
          deletedCount: result.deletedCount,
          isBulk:
            options?.isBulk ??
            (target.type === "matching" || target.ids.length > 1),
        });
      }
      return result.deletedCount;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-guardrails");
      return null;
    } finally {
      await invalidateGuardrails();
    }
  };

  return { deleteGuardrails, mutation };
}
