import { useInvalidateGatewayGuardrails } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayGuardrails";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
  type RouterInputs,
} from "@/src/utils/api";

export type GatewayGuardrailDeleteTargetInput =
  RouterInputs["aiGateway"]["deleteGuardrails"]["target"];

export function useDeleteGatewayGuardrails(organizationId: string) {
  const invalidateGuardrails = useInvalidateGatewayGuardrails(organizationId);
  const mutation = api.aiGateway.deleteGuardrails.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-guardrails"),
  });

  const deleteGuardrails = async (
    target: GatewayGuardrailDeleteTargetInput,
  ) => {
    try {
      await mutation.mutateAsync({
        orgId: organizationId,
        target,
      });
      return true;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-guardrails");
      return false;
    } finally {
      await invalidateGuardrails();
    }
  };

  return { deleteGuardrails, mutation };
}
