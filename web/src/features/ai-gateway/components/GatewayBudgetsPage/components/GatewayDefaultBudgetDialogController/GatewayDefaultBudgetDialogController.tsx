import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { useCaptureGatewayBudgetChange } from "@/src/features/ai-gateway/hooks/useCaptureGatewayBudgetChange";
import { useGatewayDefaultBudget } from "@/src/features/ai-gateway/hooks/useGatewayDefaultBudget";
import { useSetGatewayDefaultBudget } from "@/src/features/ai-gateway/hooks/useSetGatewayDefaultBudget";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { GatewayBudgetDialog } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetDialog/GatewayBudgetDialog";

const copyBySubject = {
  key: {
    title: "Default key budget",
    description:
      "Every gateway key without its own budget gets this budget, including service account keys.",
  },
  user: {
    title: "Default user budget",
    description:
      "Every user without their own budget gets this budget. It caps all of their gateway keys, in addition to each key's own budget.",
  },
} as const satisfies Record<"key" | "user", Record<string, string>>;

type GatewayDefaultBudgetDialogControllerProps = {
  organizationId: string;
  subject: "key" | "user";
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
  const { spendBudgetUnavailableReason } =
    useGatewaySettingsAccess(organizationId);
  const defaultBudget = useGatewayDefaultBudget(organizationId, subject);
  const { setDefaultBudget, mutation } =
    useSetGatewayDefaultBudget(organizationId);
  const captureBudgetChange = useCaptureGatewayBudgetChange(organizationId);

  const save = async (
    spendLimit: GatewaySpendLimit | null,
    closeDialog: () => void,
  ) => {
    const saved = await setDefaultBudget({ subject, spendLimit });
    if (!saved) return;
    captureBudgetChange({
      surface: "budgets_page",
      scope: subject === "key" ? "API_KEY_DEFAULT" : "USER_DEFAULT",
      subjectCount: 1,
      spendLimit,
    });
    closeDialog();
    mutation.reset();
  };

  return (
    <DialogController
      onBeforeClose={() => !mutation.isPending}
      onDismiss={() => mutation.reset()}
      renderDialog={({ closeDialog }) => (
        <GatewayBudgetDialog
          title={copyBySubject[subject].title}
          description={copyBySubject[subject].description}
          subject={subject}
          spendLimit={defaultBudget ?? null}
          saveLabel="Save default"
          removeLabel={defaultBudget ? "Remove default" : undefined}
          unavailableReason={spendBudgetUnavailableReason}
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
