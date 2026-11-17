import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { GatewaySpendBudgetField } from "@/src/features/ai-gateway/components/GatewaySpendBudgetField/GatewaySpendBudgetField";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { getGatewaySpendBudgetLimitError } from "@/src/features/ai-gateway/fns/getGatewaySpendBudgetLimitError";

const gatewayUserBudgetFormSchema = z.object({
  spendBudget: z.object({
    interval: z.custom<GatewaySpendBudgetInterval>(),
    limitUsd: z.string().superRefine((value, context) => {
      const message = getGatewaySpendBudgetLimitError(value);
      if (message) context.addIssue({ code: "custom", message });
    }),
  }),
});

type GatewayUserBudgetFormValues = z.infer<typeof gatewayUserBudgetFormSchema>;

type GatewaySpendLimit = {
  interval: GatewaySpendBudgetInterval;
  limitUsd: number;
};

type GatewayUserBudgetDialogProps = {
  userName: string;
  /** The user's current budget; null for a user without one. */
  spendLimit: GatewaySpendLimit | null;
  /** Why a budget cannot be set or changed; undefined when it can. */
  unavailableReason?: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (spendLimit: GatewaySpendLimit) => void;
  onRemove: () => void;
};

/** Sets, changes or removes the budget that caps all of a user's gateway keys. */
export function GatewayUserBudgetDialog({
  userName,
  spendLimit,
  unavailableReason,
  errorMessage,
  isSubmitting,
  onSubmit,
  onRemove,
}: GatewayUserBudgetDialogProps) {
  const formId = useId();
  const form = useForm<GatewayUserBudgetFormValues>({
    resolver: zodResolver(gatewayUserBudgetFormSchema),
    defaultValues: {
      spendBudget: spendLimit
        ? {
            interval: spendLimit.interval,
            limitUsd: String(spendLimit.limitUsd),
          }
        : { interval: "MONTHLY", limitUsd: "" },
    },
    mode: "onChange",
  });

  const handleValidSubmit = (values: GatewayUserBudgetFormValues) => {
    onSubmit({
      interval: values.spendBudget.interval,
      limitUsd: Number(values.spendBudget.limitUsd.trim()),
    });
  };

  return (
    <Dialog
      title={spendLimit ? "Edit user budget" : "Set user budget"}
      size="md"
      noCapture
      actions={[
        ...(spendLimit
          ? [
              {
                label: "Remove budget",
                type: "button" as const,
                variant: "destructive" as const,
                disabled: isSubmitting,
                onClick: onRemove,
              },
            ]
          : []),
        {
          label: spendLimit ? "Save changes" : "Set budget",
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
          <p className="text-muted-foreground text-sm">
            Applies to every gateway key of{" "}
            <span className="text-foreground font-medium">{userName}</span>, in
            addition to each key&apos;s own budget.
          </p>
          <GatewaySpendBudgetField
            subject="user"
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
