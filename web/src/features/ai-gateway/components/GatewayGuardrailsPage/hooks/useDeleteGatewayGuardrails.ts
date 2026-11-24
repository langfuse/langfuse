import { useInvalidateGatewayGuardrails } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayGuardrails";
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
  const mutation = api.aiGateway.guardrails.delete.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-guardrails"),
  });

  const deleteGuardrails = async (
    target: GatewayGuardrailDeleteTargetInput,
  ) => {
    try {
      const result = await mutation.mutateAsync({
        orgId: organizationId,
        target,
      });
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
