import type { GatewaySetupBudgets } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { useGatewayDefaultBudget } from "@/src/features/ai-gateway/hooks/useGatewayDefaultBudget";
import { useGatewayOrganizationBudget } from "@/src/features/ai-gateway/hooks/useGatewayOrganizationBudget";
import { useSetGatewayDefaultBudget } from "@/src/features/ai-gateway/hooks/useSetGatewayDefaultBudget";
import { useSetGatewayOrganizationBudget } from "@/src/features/ai-gateway/hooks/useSetGatewayOrganizationBudget";

/** The organization budget and the default user budget, as the setup guide reads and saves them together. */
export function useGatewaySetupBudgets(organizationId: string) {
  const organizationBudget = useGatewayOrganizationBudget(organizationId);
  const defaultUserBudget = useGatewayDefaultBudget(organizationId, "user");
  const { setBudget, mutation: organizationMutation } =
    useSetGatewayOrganizationBudget(organizationId);
  const { setDefaultBudget, mutation: defaultMutation } =
    useSetGatewayDefaultBudget(organizationId);
  const failedMutation = [organizationMutation, defaultMutation].find(
    (mutation) => mutation.isError,
  );

  /** Resolves which of the two were saved; null removes a budget, and the server keeps an unchanged one. */
  async function saveBudgets(budgets: GatewaySetupBudgets) {
    const [organization, user] = await Promise.all([
      setBudget(budgets.organization),
      setDefaultBudget({ subject: "user", spendLimit: budgets.user }),
    ]);
    return { organization, user };
  }

  return {
    /** Undefined until both are loaded. */
    budgets:
      organizationBudget === undefined || defaultUserBudget === undefined
        ? undefined
        : {
            organization: organizationBudget?.spendLimit ?? null,
            user: defaultUserBudget,
          },
    saveBudgets,
    isSaving: organizationMutation.isPending || defaultMutation.isPending,
    errorMessage: failedMutation
      ? (failedMutation.error?.message ?? "Try again.")
      : null,
  };
}
