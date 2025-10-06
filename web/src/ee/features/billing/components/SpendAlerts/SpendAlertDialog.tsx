import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod/v4";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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

const spendAlertSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be less than 100 characters"),
  threshold: z.coerce
    .number()
    .positive("Threshold must be positive")
    .max(1000000, "Threshold must be less than $1,000,000"),
});

type SpendAlertFormData = z.infer<typeof spendAlertSchema>;

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

  const form = useForm<SpendAlertFormData>({
    resolver: zodResolver(spendAlertSchema),
    defaultValues: {
      title: alert?.title ?? "",
      threshold: alert ? parseFloat(alert.threshold.toString()) : undefined,
    },
  });

  const createMutation = api.spendAlerts.createSpendAlert.useMutation();
  const updateMutation = api.spendAlerts.updateSpendAlert.useMutation();

  const onSubmit = async (data: SpendAlertFormData) => {
    setIsSubmitting(true);
    try {
      if (alert) {
        // Update existing alert
        await updateMutation.mutateAsync({
          orgId,
          id: alert.id,
          title: data.title,
          threshold: data.threshold,
        });
        capture("spend_alert:updated", {
          orgId,
          alertId: alert.id,
          threshold: data.threshold,
        });
        toast.success("Spend alert updated successfully");
      } else {
        // Create new alert
        await createMutation.mutateAsync({
          orgId,
          title: data.title,
          threshold: data.threshold,
        });
        capture("spend_alert:created", {
          orgId,
          threshold: data.threshold,
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {alert ? "Edit Spend Alert" : "Create Spend Alert"}
          </DialogTitle>
          <DialogDescription>
            Get notified when your organization's spending exceeds a threshold.
            Alerts trigger once per billing cycle.
          </DialogDescription>
        </DialogHeader>
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
              name="threshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Threshold (USD)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max="1000000"
                      placeholder="100.00"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
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
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
