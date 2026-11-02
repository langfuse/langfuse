import { useId, type ComponentProps } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { api, reportNonTrpcError, type RouterOutputs } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { showSuccessToast, showToast } from "@/src/features/notifications";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { Info } from "@langfuse/icons";

const spendAlertSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be less than 100 characters"),
  limit: z.coerce
    .number()
    .positive("Limit must be positive")
    .max(1000000, "Limit must be less than $1,000,000"),
});

type SpendAlertFormInput = z.input<typeof spendAlertSchema>;
type SpendAlertFormOutput = z.output<typeof spendAlertSchema>;

type SpendAlertDialogState =
  | { mode: "create" }
  | {
      mode: "edit";
      alert: Pick<
        RouterOutputs["spendAlerts"]["getSpendAlerts"][number],
        "id" | "title" | "threshold"
      >;
    };

export function ConnectedSpendAlertDialogController({
  orgId,
  onSuccess,
  children,
}: {
  orgId: string;
  onSuccess: () => void;
  children: ComponentProps<
    typeof DialogController<SpendAlertDialogState>
  >["children"];
}) {
  const capture = usePostHogClientCapture();
  const createMutation = api.spendAlerts.createSpendAlert.useMutation();
  const updateMutation = api.spendAlerts.updateSpendAlert.useMutation();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (
    state: SpendAlertDialogState,
    data: SpendAlertFormOutput,
    closeDialog: () => void,
  ) => {
    try {
      if (state.mode === "edit") {
        await updateMutation.mutateAsync({
          orgId,
          id: state.alert.id,
          title: data.title,
          threshold: data.limit,
        });
        capture("spend_alert:updated", {
          orgId,
          alertId: state.alert.id,
          limit: data.limit,
        });
        showSuccessToast({
          operation: "spend_alert.update",
          title: "Spend alert updated successfully",
          description: "",
        });
      } else {
        await createMutation.mutateAsync({
          orgId,
          title: data.title,
          threshold: data.limit,
        });
        capture("spend_alert:created", {
          orgId,
          limit: data.limit,
        });
        showSuccessToast({
          operation: "spend_alert.create",
          title: "Spend alert created successfully",
          description: "",
        });
      }
      closeDialog();
      onSuccess();
    } catch (error) {
      reportNonTrpcError(error, "billing");
      showToast({
        type: "ERROR",
        title: `Failed to ${state.mode === "edit" ? "update" : "create"} spend alert. Please try again.`,
        analytics: classifyTrpcToastError(
          error,
          state.mode === "edit" ? "spend_alert.update" : "spend_alert.create",
        ),
      });
    }
  };

  return (
    <DialogController<SpendAlertDialogState>
      onBeforeClose={() => !isSubmitting}
      renderDialog={({ state, closeDialog }) => (
        <SpendAlertDialog
          state={state}
          isSubmitting={isSubmitting}
          onSubmit={(data) => onSubmit(state, data, closeDialog)}
        />
      )}
    >
      {children}
    </DialogController>
  );
}

function SpendAlertDialog({
  state,
  isSubmitting,
  onSubmit,
}: {
  state: SpendAlertDialogState;
  isSubmitting: boolean;
  onSubmit: (data: SpendAlertFormOutput) => Promise<void>;
}) {
  const formId = useId();
  const form = useForm<SpendAlertFormInput, undefined, SpendAlertFormOutput>({
    resolver: zodResolver(spendAlertSchema),
    defaultValues: {
      title: state.mode === "edit" ? state.alert.title : "",
      limit:
        state.mode === "edit"
          ? parseFloat(state.alert.threshold.toString())
          : undefined,
    },
  });

  return (
    <Dialog
      size="sm"
      title={state.mode === "edit" ? "Edit Spend Alert" : "Create Spend Alert"}
      actions={[
        {
          label: state.mode === "edit" ? "Update Alert" : "Create Alert",
          loading: isSubmitting,
          type: "submit",
          form: formId,
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground">
          Get notified when your organization&apos;s spending exceeds a limit.
        </p>
        <Form {...form}>
          <form
            id={formId}
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alert Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Production Alert" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="limit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Limit (USD)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max="1000000"
                      placeholder="100.00"
                      name={field.name}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      onChange={field.onChange}
                      value={
                        typeof field.value === "number" ||
                        typeof field.value === "string"
                          ? field.value
                          : ""
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="text-muted-foreground text-xs">
              <div className="flex flex-row items-center">
                <Info size="sm" __rawClassName="mr-2" />
                <span className="font-bold">How it works</span>
              </div>
              <ul className="list-disc pl-5">
                <li>
                  The limit is evaluated against your upcoming invoice total,
                  including base fee, running usage fees, discounts, and taxes.
                </li>
                <li>Alerts trigger once per billing cycle.</li>
                <li>You will receive an email when the alert is triggered.</li>
                <li>Alerts are evaluated with a 90 minute delay.</li>
              </ul>
            </div>
          </form>
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
