import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import { GatewayOrganizationBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayOrganizationBudgetDialogController/GatewayOrganizationBudgetDialogController";
import { useGatewayOrganizationBudgets } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayOrganizationBudgets";
import {
  type GatewayOrganizationBudgetRow,
  GatewayOrganizationBudgetsTable,
} from "./GatewayOrganizationBudgetsTable";

type ConnectedGatewayOrganizationBudgetsTableProps = {
  organizationId: string;
};

export function ConnectedGatewayOrganizationBudgetsTable({
  organizationId,
}: ConnectedGatewayOrganizationBudgetsTableProps) {
  const budgets = useGatewayOrganizationBudgets(organizationId);

  return (
    <GatewayOrganizationBudgetDialogController organizationId={organizationId}>
      {({ openDialog }) => {
        const handleEditBudget = (row: GatewayOrganizationBudgetRow) =>
          openDialog({ id: row.id, spendLimit: row.spendLimit });
        return (
          <GatewayOrganizationBudgetsTable
            data={toTableData(budgets)}
            onEditBudget={handleEditBudget}
          />
        );
      }}
    </GatewayOrganizationBudgetDialogController>
  );
}

function toTableData(query: {
  isError: boolean;
  data?: GatewayOrganizationBudgetRow[];
}): AsyncTableData<GatewayOrganizationBudgetRow[]> {
  if (query.isError) {
    return { status: "error", error: "Budgets could not be loaded." };
  }
  if (!query.data) return { status: "loading" };
  return { status: "success", data: query.data };
}
