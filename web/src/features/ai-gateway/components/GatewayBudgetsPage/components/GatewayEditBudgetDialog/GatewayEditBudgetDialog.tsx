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

const gatewayEditBudgetFormSchema = z.object({
  spendBudget: z.object({
    interval: z.custom<GatewaySpendBudgetInterval>(),
    limitUsd: z.string().superRefine((value, context) => {
      const message = getGatewaySpendBudgetLimitError(value);
      if (message) context.addIssue({ code: "custom", message });
    }),
  }),
});

type GatewayEditBudgetFormValues = z.infer<typeof gatewayEditBudgetFormSchema>;

type GatewaySpendLimit = {
  interval: GatewaySpendBudgetInterval;
  limitUsd: number;
};

const titles = { key: "Edit key budget", user: "Edit user budget" } as const;

type GatewayEditBudgetDialogProps = {
  /** What the budget caps: one key, or all keys of a user. */
  subject: keyof typeof titles;
  subjectName: string;
  spendLimit: GatewaySpendLimit;
  /** Why the budget cannot be changed; undefined when it can. */
  unavailableReason?: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (spendLimit: GatewaySpendLimit) => void;
  onRemove: () => void;
};

/** Changes or removes the budget of a key or of all of a user's keys. */
export function GatewayEditBudgetDialog({
  subject,
  subjectName,
  spendLimit,
  unavailableReason,
  errorMessage,
  isSubmitting,
  onSubmit,
  onRemove,
}: GatewayEditBudgetDialogProps) {
  const formId = useId();
  const form = useForm<GatewayEditBudgetFormValues>({
    resolver: zodResolver(gatewayEditBudgetFormSchema),
    defaultValues: {
      spendBudget: {
        interval: spendLimit.interval,
        limitUsd: String(spendLimit.limitUsd),
      },
    },
    mode: "onChange",
  });

  const handleValidSubmit = (values: GatewayEditBudgetFormValues) => {
    onSubmit({
      interval: values.spendBudget.interval,
      limitUsd: Number(values.spendBudget.limitUsd.trim()),
    });
  };

  const name = (
    <span className="text-foreground font-medium">{subjectName}</span>
  );

  return (
    <Dialog
      title={titles[subject]}
      size="md"
      noCapture
      actions={[
        {
          label: "Remove budget",
          type: "button",
          variant: "destructive",
          disabled: isSubmitting,
          onClick: onRemove,
        },
        {
          label: "Save changes",
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
            {subject === "user" ? (
              <>
                Applies to every gateway key of {name}, in addition to each
                key&apos;s own budget.
              </>
            ) : (
              <>Applies to requests with {name}.</>
            )}
          </p>
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
