import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { api } from "@/src/utils/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { toast } from "sonner";
import { Bell, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

const usageAlertsSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().int().positive(),
  notifications: z.object({
    email: z.boolean(),
    recipients: z.array(z.string().email()),
  }),
});

type UsageAlertsFormData = z.infer<typeof usageAlertsSchema>;

export function UsageAlerts({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [newRecipient, setNewRecipient] = useState("");
  const [isAddingRecipient, setIsAddingRecipient] = useState(false);

  const {
    data: usageAlerts,
    isLoading,
    refetch,
  } = api.cloudBilling.getUsageAlerts.useQuery(
    { orgId },
    { enabled: Boolean(orgId) },
  );

  const upsertUsageAlerts = api.cloudBilling.upsertUsageAlerts.useMutation({
    onSuccess: () => {
      toast.success(t("ee.usageAlerts.updated"), {
        description: t("ee.usageAlerts.updatedDescription"),
      });
      refetch();
    },
    onError: (error) => {
      toast.error(t("ee.usageAlerts.updateFailed"), {
        description: error.message,
      });
    },
  });

  const form = useForm<UsageAlertsFormData>({
    resolver: zodResolver(usageAlertsSchema),
    defaultValues: {
      enabled: false,
      threshold: 100000,
      notifications: {
        email: true,
        recipients: [],
      },
    },
  });

  useEffect(() => {
    // Overwrite from with existing usage alerts if available
    if (usageAlerts) {
      form.reset({
        enabled: usageAlerts.enabled,
        threshold: usageAlerts.threshold,
        notifications: {
          email: usageAlerts.notifications.email,
          recipients: usageAlerts.notifications.recipients || [],
        },
      });
    }
  }, [usageAlerts, form]);

  const onSubmit = (data: UsageAlertsFormData) => {
    upsertUsageAlerts.mutate({
      orgId,
      usageAlerts: data,
    });
  };

  const addRecipient = () => {
    if (!newRecipient.trim()) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newRecipient)) {
      toast.error(t("ee.usageAlerts.invalidEmail"), {
        description: t("ee.usageAlerts.invalidEmailDescription"),
      });
      return;
    }

    const currentRecipients = form.getValues("notifications.recipients");
    if (currentRecipients.includes(newRecipient)) {
      toast.error(t("ee.usageAlerts.emailAlreadyAdded"), {
        description: t("ee.usageAlerts.emailAlreadyAddedDescription"),
      });
      return;
    }

    form.setValue("notifications.recipients", [
      ...currentRecipients,
      newRecipient,
    ]);
    setNewRecipient("");
    setIsAddingRecipient(false);
  };

  const removeRecipient = (emailToRemove: string) => {
    const currentRecipients = form.getValues("notifications.recipients");
    form.setValue(
      "notifications.recipients",
      currentRecipients.filter((email) => email !== emailToRemove),
    );
  };

  const recipients = form.watch("notifications.recipients");
  const isEnabled = form.watch("enabled");

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Usage Alerts
          </CardTitle>
          <CardDescription>Loading usage alert settings...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="pr-8">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Usage Alerts
            </CardTitle>
            <CardDescription className="mt-2">
              Get notified when your usage exceeds a specified threshold to
              avoid billing surprises. The alert triggers at most once per
              billing cycle and will only consider &quot;future&quot; usage from
              the time of creation or last update.
            </CardDescription>
          </div>
          <Form {...form}>
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </Form>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {isEnabled && (
              <>
                <FormField
                  control={form.control}
                  name="threshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Threshold Amount</FormLabel>
                      <FormControl>
                        <div className="flex items-center space-x-2">
                          <Input
                            type="number"
                            placeholder="100000"
                            {...field}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                            className="flex-1"
                          />
                          <span className="text-sm text-muted-foreground">
                            Events
                          </span>
                        </div>
                      </FormControl>
                      <FormDescription>
                        You&apos;ll receive an alert when your usage exceeds
                        this number of events in your billing period. Go to our{" "}
                        <Link
                          href={
                            "https://langfuse.com/pricing?calculatorOpen=true"
                          }
                          target="_blank"
                          className="underline"
                        >
                          pricing calculator
                        </Link>{" "}
                        to translate events into cost.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-4">
                  <div>
                    <h4 className="mb-2 text-sm font-medium">
                      Email Recipients
                    </h4>
                    <p className="mb-3 text-sm text-muted-foreground">
                      Organization admins will automatically receive alerts. Add
                      additional recipients below.
                    </p>

                    <div className="space-y-2">
                      {recipients.map((email, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-md border p-2"
                        >
                          <span className="text-sm">{email}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRecipient(email)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}

                      {isAddingRecipient ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            type="email"
                            placeholder={t(
                              "ee.usageAlerts.enterEmailPlaceholder",
                            )}
                            value={newRecipient}
                            onChange={(e) => setNewRecipient(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addRecipient();
                              }
                            }}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={addRecipient}
                          >
                            Add
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsAddingRecipient(false);
                              setNewRecipient("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsAddingRecipient(true)}
                          className="w-full"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Recipient
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={upsertUsageAlerts.isPending}>
                {upsertUsageAlerts.isPending
                  ? t("common.status.saving")
                  : t("ee.usageAlerts.saveChanges")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
