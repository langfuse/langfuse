import { useId } from "react";
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

const gatewayEditBudgetFormSchema = z.object({
  spendBudget: requiredGatewaySpendBudgetFormSchema,
});

type GatewayEditBudgetFormValues = z.infer<typeof gatewayEditBudgetFormSchema>;

const nouns = { key: "key", user: "user" } as const;

type GatewayEditBudgetDialogProps = {
  /** What each budget caps: one key, or all keys of a user. */
  subject: keyof typeof nouns;
  /** The keys or users whose budgets change together. */
  subjectCount: number;
  /** Shown when only one key or user changes. */
  subjectName?: string;
  /** Prefills the form; null when the key or user has no budget yet. */
  spendLimit: GatewaySpendLimit | null;
  /** How many of them already have a budget that saving replaces. */
  existingBudgetCount: number | null;
  /** Why the budget cannot be changed; undefined when it can. */
  unavailableReason?: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (spendLimit: GatewaySpendLimit) => void;
  onRemove: () => void;
};

/** Changes or removes the budgets of keys or of all of users' keys. */
export function GatewayEditBudgetDialog({
  subject,
  subjectCount,
  subjectName,
  spendLimit,
  existingBudgetCount,
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
      spendBudget: toGatewaySpendBudgetFormValue(spendLimit),
    },
    mode: "onChange",
  });

  const handleValidSubmit = (values: GatewayEditBudgetFormValues) => {
    onSubmit(toGatewaySpendLimit(values.spendBudget));
  };

  const isBulk = subjectCount > 1;
  const noun = nouns[subject];
  const applies = isBulk ? "Each budget applies" : "Applies";
  const removeLabel = isBulk ? "Remove budgets" : "Remove budget";
  const replaceWarning = isBulk
    ? describeReplacedBudgets(existingBudgetCount, subjectCount, noun)
    : null;
  const name = (
    <span className="text-foreground font-medium">
      {isBulk ? `${subjectCount} ${noun}s` : subjectName}
    </span>
  );

  return (
    <Dialog
      title={
        isBulk ? `Edit ${subjectCount} ${noun} budgets` : `Edit ${noun} budget`
      }
      size="md"
      noCapture
      actions={[
        ...(isBulk || spendLimit
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
          label: "Save changes",
          type: "submit",
          form: formId,
          loading: isSubmitting,
          disabled:
            unavailableReason !== undefined ||
            !form.formState.isValid ||
            // Selected budgets may differ, so saving the prefilled one changes them.
            (!isBulk && !form.formState.isDirty),
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
                {applies} to every gateway key of {name}, in addition to each
                key&apos;s own budget.
              </>
            ) : (
              <>
                {applies} to requests with {name}.
              </>
            )}
          </p>
          {replaceWarning !== null ? (
            <Alert variant="warning" size="sm">
              <Alert.Description>{replaceWarning}</Alert.Description>
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

function describeReplacedBudgets(
  existingCount: number | null,
  selectedCount: number,
  noun: string,
) {
  if (existingCount === null) {
    return `Selected ${noun}s that already have a budget get this one instead.`;
  }
  if (existingCount === 0) return null;
  const pronoun = existingCount === 1 ? "it" : "them";
  if (existingCount === selectedCount) {
    return `All selected ${noun}s already have a budget. Saving replaces ${pronoun} with this one.`;
  }
  return `${existingCount} of the selected ${noun}s already have a budget. Saving replaces ${pronoun} with this one.`;
}
