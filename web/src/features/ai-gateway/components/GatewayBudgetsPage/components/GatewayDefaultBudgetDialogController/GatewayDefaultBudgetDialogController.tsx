import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { useGatewayDefaultBudget } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayDefaultBudget";
import { useSetGatewayDefaultBudget } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayDefaultBudget";
import type {
  GatewayBudgetSubject,
  GatewaySpendLimit,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { GatewayDefaultBudgetDialog } from "./components/GatewayDefaultBudgetDialog/GatewayDefaultBudgetDialog";

type GatewayDefaultBudgetDialogControllerProps = {
  organizationId: string;
  subject: GatewayBudgetSubject;
  children: (control: {
    openDialog: () => void;
    /** The current default: undefined while loading, null when none is set. */
    defaultBudget: GatewaySpendLimit | null | undefined;
  }) => ReactNode;
};

/** Sets or removes the default budget of keys or users; the server checks that the caller is a gateway manager. */
export function GatewayDefaultBudgetDialogController({
  organizationId,
  subject,
  children,
}: GatewayDefaultBudgetDialogControllerProps) {
  const { isRecording } = useGatewaySettingsAccess(organizationId);
  const defaultBudget = useGatewayDefaultBudget(organizationId, subject);
  const { setDefaultBudget, mutation } =
    useSetGatewayDefaultBudget(organizationId);

  const save = async (
    spendLimit: GatewaySpendLimit | null,
    closeDialog: () => void,
  ) => {
    const saved = await setDefaultBudget({ subject, spendLimit });
    if (!saved) return;
    closeDialog();
    mutation.reset();
  };

  return (
    <DialogController
      onBeforeClose={() => !mutation.isPending}
      onDismiss={() => mutation.reset()}
      renderDialog={({ closeDialog }) => (
        <GatewayDefaultBudgetDialog
          subject={subject}
          spendLimit={defaultBudget ?? null}
          unavailableReason={
            isRecording === false
              ? "Spend budgets need recorded gateway requests. Switch the gateway ingestion to usage to set one."
              : undefined
          }
          errorMessage={
            mutation.isError ? (mutation.error?.message ?? "Try again.") : null
          }
          isSubmitting={mutation.isPending}
          onSubmit={(spendLimit) => save(spendLimit, closeDialog)}
          onRemove={() => save(null, closeDialog)}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog, defaultBudget })}
    </DialogController>
  );
}
