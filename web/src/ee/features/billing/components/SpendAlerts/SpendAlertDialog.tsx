import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod/v4";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { toast } from "sonner";
import { Info } from "lucide-react";

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

interface SpendAlertDialogProps {
  orgId: string;
  alert?: {
    id: string;
    title: string;
    threshold: { toString(): string };
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function SpendAlertDialog({
  orgId,
  alert,
  open,
  onOpenChange,
  onSuccess,
}: SpendAlertDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const capture = usePostHogClientCapture();

  const form = useForm<SpendAlertFormInput, undefined, SpendAlertFormOutput>({
    resolver: zodResolver(spendAlertSchema),
    defaultValues: {
      title: alert?.title ?? "",
      limit: alert ? parseFloat(alert.threshold.toString()) : undefined,
    },
  });

  const createMutation = api.spendAlerts.createSpendAlert.useMutation();
  const updateMutation = api.spendAlerts.updateSpendAlert.useMutation();

  const onSubmit = async (data: SpendAlertFormOutput) => {
    setIsSubmitting(true);
    try {
      if (alert) {
        // Update existing alert
        await updateMutation.mutateAsync({
          orgId,
          id: alert.id,
          title: data.title,
          threshold: data.limit,
        });
        capture("spend_alert:updated", {
          orgId,
          alertId: alert.id,
          limit: data.limit,
        });
        toast.success("Spend alert updated successfully");
      } else {
        // Create new alert
        await createMutation.mutateAsync({
          orgId,
          title: data.title,
          threshold: data.limit,
        });
        capture("spend_alert:created", {
          orgId,
          limit: data.limit,
        });
        toast.success("Spend alert created successfully");
      }
      onSuccess();
    } catch (error) {
      console.error("Failed to save spend alert:", error);
      toast.error(
        `Failed to ${alert ? "update" : "create"} spend alert. Please try again.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-4 sm:max-w-[425px]">
        <DialogTitle>
          {alert ? "Edit Spend Alert" : "Create Spend Alert"}
        </DialogTitle>
        <DialogDescription className="pb-2 pt-1 text-sm text-muted-foreground">
          Get notified when your organization&apos;s spending exceeds a limit.
        </DialogDescription>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            <div className="text-xs text-muted-foreground">
              <div className="flex flex-row items-center">
                <Info className="mr-2 h-3 w-3" />
                <span className="font-medium">How it works</span>
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
            <div className="flex flex-row items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? alert
                    ? "Updating..."
                    : "Creating..."
                  : alert
                    ? "Update Alert"
                    : "Create Alert"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
