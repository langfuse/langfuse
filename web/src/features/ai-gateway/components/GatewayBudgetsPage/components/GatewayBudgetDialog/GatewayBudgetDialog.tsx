import { type ReactNode, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { GatewaySpendBudgetField } from "@/src/features/ai-gateway/components/GatewaySpendBudgetField/GatewaySpendBudgetField";
import {
  toGatewaySpendBudgetFormValue,
  toGatewaySpendLimit,
} from "@/src/features/ai-gateway/fns/gatewaySpendBudgetFormValue";
import { requiredGatewaySpendBudgetFormSchema } from "@/src/features/ai-gateway/types/gatewaySpendBudgetFormSchema";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

const gatewayBudgetFormSchema = z.object({
  spendBudget: requiredGatewaySpendBudgetFormSchema,
});

type GatewayBudgetFormValues = z.infer<typeof gatewayBudgetFormSchema>;

type GatewayBudgetDialogProps = {
  title: string;
  /** What the budget applies to, above the inputs. */
  description: ReactNode;
  /** Shown as a warning above the inputs, e.g. that saving replaces budgets. */
  warning?: string;
  /** What the budget caps: one key, all keys of a user, or the whole organization. */
  subject: "key" | "user" | "organization";
  /** Prefills the form; null when there is no budget yet. */
  spendLimit: GatewaySpendLimit | null;
  saveLabel: string;
  /** The action that drops the budget; undefined when there is none to drop. */
  removeLabel?: string;
  /** Why the budget cannot be changed; undefined when it can. */
  unavailableReason?: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (spendLimit: GatewaySpendLimit) => void;
  onRemove: () => void;
};

/** Sets or removes a budget: of keys, of users, of the organization, or the organization's default for keys or users. */
export function GatewayBudgetDialog({
  title,
  description,
  warning,
  subject,
  spendLimit,
  saveLabel,
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
      spendBudget: toGatewaySpendBudgetFormValue(spendLimit),
    },
    mode: "onChange",
  });

  const handleValidSubmit = (values: GatewayBudgetFormValues) => {
    onSubmit(toGatewaySpendLimit(values.spendBudget));
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
          // Saving an unchanged budget changes nothing, so it is not disabled.
          disabled: unavailableReason !== undefined || !form.formState.isValid,
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
