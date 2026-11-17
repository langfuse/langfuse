import { type ComponentProps, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { AsyncSelectInput } from "@/src/components/design-system/AsyncSelectInput/AsyncSelectInput";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { GatewaySpendBudgetField } from "@/src/features/ai-gateway/components/GatewaySpendBudgetField/GatewaySpendBudgetField";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { getGatewaySpendBudgetLimitError } from "@/src/features/ai-gateway/fns/getGatewaySpendBudgetLimitError";

const targetLabels = {
  apiKeys: {
    title: "Add key budget",
    field: "Gateway key",
    placeholder: "Select a key",
  },
  users: {
    title: "Add user budget",
    field: "User",
    placeholder: "Select a user",
  },
} as const satisfies Record<GatewaySpendTab, Record<string, string>>;

const gatewayAddBudgetFormSchema = z.object({
  target: z
    .object({ value: z.string(), label: z.string() })
    .nullable()
    .superRefine((target, context) => {
      if (target === null) {
        context.addIssue({
          code: "custom",
          message: "Select who the budget applies to",
        });
      }
    }),
  spendBudget: z.object({
    interval: z.custom<GatewaySpendBudgetInterval>(),
    limitUsd: z.string().superRefine((value, context) => {
      const message = getGatewaySpendBudgetLimitError(value);
      if (message) context.addIssue({ code: "custom", message });
    }),
  }),
});

type GatewayAddBudgetFormValues = z.infer<typeof gatewayAddBudgetFormSchema>;

type TargetPicker = {
  options: ComponentProps<typeof AsyncSelectInput<string>>["options"];
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
};

type GatewayAddBudgetDialogProps = {
  targetType: GatewaySpendTab;
  targetPicker: TargetPicker;
  /** Why a budget cannot be added; undefined when it can. */
  unavailableReason?: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (budget: {
    targetId: string;
    spendLimit: { interval: GatewaySpendBudgetInterval; limitUsd: number };
  }) => void;
};

/** Adds a budget to a gateway key or to a user, which caps all of their keys. */
export function GatewayAddBudgetDialog({
  targetType,
  targetPicker,
  unavailableReason,
  errorMessage,
  isSubmitting,
  onSubmit,
}: GatewayAddBudgetDialogProps) {
  const formId = useId();
  const form = useForm<GatewayAddBudgetFormValues>({
    resolver: zodResolver(gatewayAddBudgetFormSchema),
    defaultValues: {
      target: null,
      spendBudget: { interval: "MONTHLY", limitUsd: "" },
    },
    mode: "onChange",
  });
  const labels = targetLabels[targetType];

  const handleValidSubmit = (values: GatewayAddBudgetFormValues) => {
    if (!values.target) return;
    onSubmit({
      targetId: values.target.value,
      spendLimit: {
        interval: values.spendBudget.interval,
        limitUsd: Number(values.spendBudget.limitUsd.trim()),
      },
    });
  };

  return (
    <Dialog
      title={labels.title}
      size="md"
      noCapture
      actions={[
        {
          label: "Add budget",
          type: "submit",
          form: formId,
          loading: isSubmitting,
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
          <Form.Field
            control={form.control}
            name="target"
            label={labels.field}
            description={
              targetType === "users"
                ? "Caps every gateway key of this user, in addition to each key's own budget."
                : undefined
            }
          >
            {(field) => (
              <AsyncSelectInput
                indicator="checkmark"
                id={field.id}
                value={field.value}
                onValueChange={(option) =>
                  field.onChange({ value: option.value, label: option.label })
                }
                onBlur={field.onBlur}
                ref={field.ref}
                options={targetPicker.options}
                placeholder={labels.placeholder}
                search={{
                  placeholder: "Search…",
                  value: targetPicker.search,
                  onValueChange: targetPicker.onSearchChange,
                }}
                loading={
                  targetPicker.isLoading ? { message: "Loading…" } : undefined
                }
                emptyMessage="No matches."
                disabled={unavailableReason !== undefined}
                error={!!field.error}
                aria-invalid={!!field.error}
              />
            )}
          </Form.Field>
          <GatewaySpendBudgetField
            subject={targetType === "users" ? "user" : "key"}
            control={form.control}
            disabledReason={unavailableReason}
          />
          {errorMessage !== null ? (
            <Alert variant="destructive">
              <Alert.Title>Budget could not be added</Alert.Title>
              <Alert.Description>{errorMessage}</Alert.Description>
            </Alert>
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
