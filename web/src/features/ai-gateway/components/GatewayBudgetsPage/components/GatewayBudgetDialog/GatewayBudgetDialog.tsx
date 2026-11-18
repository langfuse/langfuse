import { type ReactNode, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { GatewaySpendBudgetField } from "@/src/features/ai-gateway/components/GatewaySpendBudgetField/GatewaySpendBudgetField";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { emptyGatewaySpendBudget } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/types/gatewayApiKeyFormSchema";
import {
  type GatewayBudgetFormValues,
  gatewayBudgetFormSchema,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/types/gatewayBudgetFormSchema";

type GatewaySpendLimit = {
  interval: GatewaySpendBudgetInterval;
  limitUsd: number;
};

type GatewayBudgetDialogProps = {
  title: string;
  /** What the budget applies to, above the inputs. */
  description: ReactNode;
  /** Shown as a warning above the inputs, e.g. that saving replaces budgets. */
  warning?: string;
  /** What the budget caps: one key, or all keys of a user. */
  subject: "key" | "user";
  /** Prefills the form; null when there is no budget yet. */
  spendLimit: GatewaySpendLimit | null;
  saveLabel: string;
  /** Saving is disabled until the form changes; false when saving the prefilled budget changes something. */
  requiresChange: boolean;
  /** The action that drops the budget; undefined when there is none to drop. */
  removeLabel?: string;
  /** Why the budget cannot be changed; undefined when it can. */
  unavailableReason?: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (spendLimit: GatewaySpendLimit) => void;
  onRemove: () => void;
};

/** Sets or removes a budget: of keys, of users, or the organization's default for either. */
export function GatewayBudgetDialog({
  title,
  description,
  warning,
  subject,
  spendLimit,
  saveLabel,
  requiresChange,
  removeLabel,
  unavailableReason,
  errorMessage,
  isSubmitting,
  onSubmit,
  onRemove,
}: GatewayBudgetDialogProps) {
  const formId = useId();
  const form = useForm<GatewayBudgetFormValues>({
    resolver: zodResolver(gatewayBudgetFormSchema),
    defaultValues: {
      spendBudget: spendLimit
        ? {
            interval: spendLimit.interval,
            limitUsd: String(spendLimit.limitUsd),
          }
        : emptyGatewaySpendBudget,
    },
    mode: "onChange",
  });

  const handleValidSubmit = (values: GatewayBudgetFormValues) => {
    onSubmit({
      interval: values.spendBudget.interval,
      limitUsd: Number(values.spendBudget.limitUsd.trim()),
    });
  };

  return (
    <Dialog
      title={title}
      size="md"
      noCapture
      actions={[
        ...(removeLabel !== undefined
          ? [
              {
                label: removeLabel,
                type: "button" as const,
                variant: "destructive" as const,
                disabled: isSubmitting,
                onClick: onRemove,
              },
            ]
          : []),
        {
          label: saveLabel,
          type: "submit",
          form: formId,
          loading: isSubmitting,
          disabled:
            unavailableReason !== undefined ||
            !form.formState.isValid ||
            (requiresChange && !form.formState.isDirty),
        },
      ]}
    >
      <Dialog.Body>
        <Form
          id={formId}
          density="compact"
          actions={[]}
          onSubmit={form.handleSubmit(handleValidSubmit)}
        >
          <p className="text-muted-foreground text-sm">{description}</p>
          {warning !== undefined ? (
            <Alert variant="warning" size="sm">
              <Alert.Description>{warning}</Alert.Description>
            </Alert>
          ) : null}
          <GatewaySpendBudgetField.Inputs
            subject={subject}
            control={form.control}
            disabledReason={unavailableReason}
          />
          {errorMessage !== null ? (
            <Alert variant="destructive">
              <Alert.Title>Budget could not be saved</Alert.Title>
              <Alert.Description>{errorMessage}</Alert.Description>
            </Alert>
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
