import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { api, reportNonTrpcError } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

const createSpendAlertSchema = (messages: {
  titleRequired: string;
  titleTooLong: string;
  limitPositive: string;
  limitTooHigh: string;
}) =>
  z.object({
    title: z
      .string()
      .min(1, messages.titleRequired)
      .max(100, messages.titleTooLong),
    limit: z.coerce
      .number()
      .positive(messages.limitPositive)
      .max(1000000, messages.limitTooHigh),
  });

type SpendAlertFormInput = z.input<ReturnType<typeof createSpendAlertSchema>>;
type SpendAlertFormOutput = z.output<ReturnType<typeof createSpendAlertSchema>>;

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
  const t = useTranslations("settingsEnterprise.billing");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const capture = usePostHogClientCapture();
  const spendAlertSchema = createSpendAlertSchema({
    titleRequired: t("spendAlerts.titleRequired"),
    titleTooLong: t("spendAlerts.titleTooLong"),
    limitPositive: t("spendAlerts.limitPositive"),
    limitTooHigh: t("spendAlerts.limitTooHigh"),
  });

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
        toast.success(t("spendAlerts.updated"));
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
        toast.success(t("spendAlerts.created"));
      }
      onSuccess();
    } catch (error) {
      reportNonTrpcError(error, "billing");
      toast.error(
        t("spendAlerts.saveFailed", {
          action: alert
            ? t("spendAlerts.updateAction")
            : t("spendAlerts.createAction"),
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-4 sm:max-w-[425px]">
        <DialogTitle>
          {alert ? t("spendAlerts.editTitle") : t("spendAlerts.createTitle")}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground pt-1 pb-2 text-sm">
          {t("spendAlerts.dialogDescription")}
        </DialogDescription>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("spendAlerts.alertTitle")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("spendAlerts.titlePlaceholder")}
                      {...field}
                    />
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
                  <FormLabel>{t("spendAlerts.limitUsd")}</FormLabel>
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
                <Info className="mr-2 h-3 w-3" />
                <span className="font-bold">{t("spendAlerts.howItWorks")}</span>
              </div>
              <ul className="list-disc pl-5">
                <li>{t("spendAlerts.calculation")}</li>
                <li>{t("spendAlerts.oncePerCycle")}</li>
                <li>{t("spendAlerts.emailNotification")}</li>
                <li>{t("spendAlerts.evaluationDelay")}</li>
              </ul>
            </div>
            <div className="flex flex-row items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? alert
                    ? t("spendAlerts.updating")
                    : t("spendAlerts.creating")
                  : alert
                    ? t("spendAlerts.update")
                    : t("spendAlerts.create")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
