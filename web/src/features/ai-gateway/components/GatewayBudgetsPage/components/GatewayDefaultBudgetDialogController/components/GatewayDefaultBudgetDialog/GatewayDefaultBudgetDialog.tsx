import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { GatewaySpendBudgetField } from "@/src/features/ai-gateway/components/GatewaySpendBudgetField/GatewaySpendBudgetField";
import { emptyGatewaySpendBudget } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/types/gatewayApiKeyFormSchema";
import type {
  GatewayBudgetSubject,
  GatewaySpendLimit,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import {
  type GatewayBudgetFormValues,
  gatewayBudgetFormSchema,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/types/gatewayBudgetFormSchema";

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
} as const satisfies Record<GatewayBudgetSubject, Record<string, string>>;

type GatewayDefaultBudgetDialogProps = {
  subject: GatewayBudgetSubject;
  /** The current default; null when none is set. */
  spendLimit: GatewaySpendLimit | null;
  /** Why the default cannot be changed; undefined when it can. */
  unavailableReason?: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (spendLimit: GatewaySpendLimit) => void;
  onRemove: () => void;
};

/** Sets or removes the organization's default budget for keys or users. */
export function GatewayDefaultBudgetDialog({
  subject,
  spendLimit,
  unavailableReason,
  errorMessage,
  isSubmitting,
  onSubmit,
  onRemove,
}: GatewayDefaultBudgetDialogProps) {
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
  const copy = copyBySubject[subject];

  const handleValidSubmit = (values: GatewayBudgetFormValues) => {
    onSubmit({
      interval: values.spendBudget.interval,
      limitUsd: Number(values.spendBudget.limitUsd.trim()),
    });
  };

  return (
    <Dialog
      title={copy.title}
      size="md"
      actions={[
        ...(spendLimit
          ? [
              {
                label: "Remove default",
                type: "button" as const,
                variant: "destructive" as const,
                disabled: isSubmitting,
                onClick: onRemove,
              },
            ]
          : []),
        {
          label: "Save default",
          type: "submit",
          form: formId,
          loading: isSubmitting,
          disabled:
            unavailableReason !== undefined ||
            !form.formState.isValid ||
            !form.formState.isDirty,
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
          <p className="text-muted-foreground text-sm">{copy.description}</p>
          <GatewaySpendBudgetField.Inputs
            subject={subject}
            control={form.control}
            disabledReason={unavailableReason}
          />
          {errorMessage !== null ? (
            <Alert variant="destructive">
              <Alert.Title>Default budget could not be saved</Alert.Title>
              <Alert.Description>{errorMessage}</Alert.Description>
            </Alert>
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
