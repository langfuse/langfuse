import React, { useState } from "react";
import { useForm } from "react-hook-form";
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
import { AlertTriangle, Bell, Mail, Plus, X } from "lucide-react";

const billingAlertsSchema = z.object({
  enabled: z.boolean(),
  thresholdAmount: z
    .number()
    .positive()
    .min(1, "Threshold must be at least $1"),
  currency: z.string().default("USD"),
  notifications: z.object({
    email: z.boolean(),
    recipients: z.array(z.string().email()),
  }),
});

type BillingAlertsFormData = z.infer<typeof billingAlertsSchema>;

interface BillingAlertsProps {
  organizationId: string;
}

export function BillingAlerts({ organizationId }: BillingAlertsProps) {
  const [newRecipient, setNewRecipient] = useState("");
  const [isAddingRecipient, setIsAddingRecipient] = useState(false);

  const {
    data: billingAlerts,
    isLoading,
    refetch,
  } = api.cloudBilling.getBillingAlerts.useQuery(
    { organizationId },
    { enabled: !!organizationId },
  );

  const updateBillingAlerts = api.cloudBilling.updateBillingAlerts.useMutation({
    onSuccess: () => {
      toast.success("Billing alerts updated", {
        description:
          "Your billing alert settings have been saved successfully.",
      });
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to update billing alerts", {
        description: error.message,
      });
    },
  });

  const form = useForm<BillingAlertsFormData>({
    resolver: zodResolver(billingAlertsSchema),
    defaultValues: {
      enabled: true,
      thresholdAmount: 10000,
      currency: "USD",
      notifications: {
        email: true,
        recipients: [],
      },
    },
  });

  // Update form when data loads
  React.useEffect(() => {
    if (billingAlerts) {
      form.reset({
        enabled: billingAlerts.enabled,
        thresholdAmount: billingAlerts.thresholdAmount,
        currency: billingAlerts.currency,
        notifications: {
          email: billingAlerts.notifications.email,
          recipients: billingAlerts.notifications.recipients,
        },
      });
    }
  }, [billingAlerts, form]);

  const onSubmit = (data: BillingAlertsFormData) => {
    updateBillingAlerts.mutate({
      organizationId,
      billingAlerts: data,
    });
  };

  const addRecipient = () => {
    if (!newRecipient.trim()) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newRecipient)) {
      toast.error("Invalid email address", {
        description: "Please enter a valid email address.",
      });
      return;
    }

    const currentRecipients = form.getValues("notifications.recipients");
    if (currentRecipients.includes(newRecipient)) {
      toast.error("Email already added", {
        description: "This email address is already in the recipient list.",
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
            Billing Alerts
          </CardTitle>
          <CardDescription>Loading billing alert settings...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Billing Alerts
        </CardTitle>
        <CardDescription>
          Get notified when your usage exceeds a specified threshold to avoid
          billing surprises.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Enable Billing Alerts
                    </FormLabel>
                    <FormDescription>
                      Receive notifications when your usage exceeds the
                      threshold.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {isEnabled && (
              <>
                <FormField
                  control={form.control}
                  name="thresholdAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Threshold Amount</FormLabel>
                      <FormControl>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">$</span>
                          <Input
                            type="number"
                            placeholder="10000"
                            {...field}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                            className="flex-1"
                          />
                          <span className="text-sm text-muted-foreground">
                            USD
                          </span>
                        </div>
                      </FormControl>
                      <FormDescription>
                        You&apos;ll receive an alert when your usage exceeds
                        this amount in your billing period.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notifications.email"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="flex items-center gap-2 text-base">
                          <Mail className="h-4 w-4" />
                          Email Notifications
                        </FormLabel>
                        <FormDescription>
                          Send email alerts to specified recipients.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {form.watch("notifications.email") && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="mb-2 text-sm font-medium">
                        Email Recipients
                      </h4>
                      <p className="mb-3 text-sm text-muted-foreground">
                        Organization admins will automatically receive alerts.
                        Add additional recipients below.
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
                              placeholder="Enter email address"
                              value={newRecipient}
                              onChange={(e) => setNewRecipient(e.target.value)}
                              onKeyPress={(e) => {
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
                )}

                {billingAlerts?.lastTriggeredAt && (
                  <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                          Last Alert Triggered
                        </p>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          {new Date(
                            billingAlerts.lastTriggeredAt,
                          ).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={updateBillingAlerts.isLoading}>
                {updateBillingAlerts.isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
