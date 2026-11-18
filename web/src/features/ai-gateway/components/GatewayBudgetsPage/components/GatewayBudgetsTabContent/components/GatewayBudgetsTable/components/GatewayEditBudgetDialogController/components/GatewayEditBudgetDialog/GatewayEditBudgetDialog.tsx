import { useId } from "react";
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

const nouns = { key: "key", user: "user" } as const;

type GatewayEditBudgetDialogProps = {
  /** What each budget caps: one key, or all keys of a user. */
  subject: keyof typeof nouns;
  /** The keys or users whose budgets change together. */
  subjectNames: string[];
  /** Prefills the form; null when the key or user has no budget yet. */
  spendLimit: GatewaySpendLimit | null;
  /** How many of them already have a budget that saving replaces. */
  existingBudgetCount: number;
  /** The action that drops the budgets; undefined when there is none to drop. */
  removeLabel?: string;
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
  subjectNames,
  spendLimit,
  existingBudgetCount,
  removeLabel,
  unavailableReason,
  errorMessage,
  isSubmitting,
  onSubmit,
  onRemove,
}: GatewayEditBudgetDialogProps) {
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

  const isBulk = subjectNames.length > 1;
  const noun = nouns[subject];
  const applies = isBulk ? "Each budget applies" : "Applies";
  const replaceWarning = isBulk
    ? describeReplacedBudgets(existingBudgetCount, subjectNames.length, noun)
    : null;
  const name = (
    <span className="text-foreground font-medium">
      {isBulk ? `${subjectNames.length} ${noun}s` : subjectNames[0]}
    </span>
  );

  return (
    <Dialog
      title={
        isBulk
          ? `Edit ${subjectNames.length} ${noun} budgets`
          : `Edit ${noun} budget`
      }
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
          label: "Save changes",
          type: "submit",
          form: formId,
          loading: isSubmitting,
          disabled:
            unavailableReason !== undefined ||
            !form.formState.isValid ||
            // Selected budgets may differ, and a key or user on the default gets a budget of its own, so saving the prefilled one changes them.
            (!isBulk && existingBudgetCount > 0 && !form.formState.isDirty),
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
  existingCount: number,
  selectedCount: number,
  noun: string,
) {
  if (existingCount === 0) return null;
  const pronoun = existingCount === 1 ? "it" : "them";
  if (existingCount === selectedCount) {
    return `All selected ${noun}s already have a budget. Saving replaces ${pronoun} with this one.`;
  }
  return `${existingCount} of the selected ${noun}s already have a budget. Saving replaces ${pronoun} with this one.`;
}
