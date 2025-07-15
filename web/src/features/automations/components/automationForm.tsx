import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Separator } from "@/src/components/ui/separator";
import { Switch } from "@/src/components/ui/switch";
import { useRouter } from "next/router";
import { z } from "zod/v4";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { api } from "@/src/utils/api";
import {
  type AutomationDomain,
  type ActionTypes,
  type JobConfigState,
  webhookActionFilterOptions,
} from "@langfuse/shared";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { DeleteAutomationButton } from "./DeleteAutomationButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { ActionHandlerRegistry } from "./actions";
import { webhookSchema } from "./actions/WebhookActionForm";
import { MultiSelect } from "@/src/features/filters/components/multi-select";

// Define the TriggerEventSource enum directly in this file to match the backend
enum TriggerEventSource {
  Prompt = "prompt",
}

// Define schemas for form validation
const baseFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  eventSource: z.string().min(1, "Event source is required"),
  eventAction: z
    .array(z.string())
    .min(1, "At least one event action is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  filter: z.array(z.any()).optional(),
});

const formSchema = z.discriminatedUnion("actionType", [
  baseFormSchema.extend({
    actionType: z.literal("WEBHOOK"),
    webhook: webhookSchema,
  }),
  // add more action types here
]);

type FormValues = z.infer<typeof formSchema>;

interface AutomationFormProps {
  projectId: string;
  onSuccess?: (automationId?: string, webhookSecret?: string) => void;
  onCancel?: () => void;
  automation?: AutomationDomain;
  isEditing?: boolean;
}

export const AutomationForm = ({
  projectId,
  onSuccess,
  onCancel,
  automation,
  isEditing = false,
}: AutomationFormProps) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("webhook");
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  const utils = api.useUtils();

  // Set up mutations
  const createAutomationMutation = api.automations.createAutomation.useMutation(
    {
      onSuccess: async () => {
        // Invalidate automations queries
        await utils.automations.invalidate();
      },
    },
  );
  const updateAutomationMutation = api.automations.updateAutomation.useMutation(
    {
      onSuccess: async () => {
        // Invalidate automations queries
        await utils.automations.invalidate();
      },
    },
  );

  // Get the action type for the form when editing
  const getActionType = () => {
    if (isEditing && automation?.action?.type) {
      return automation.action.type as ActionTypes;
    }
    return "WEBHOOK";
  };

  // Get default values based on action type
  const getDefaultValues = (): FormValues => {
    const actionType = getActionType();
    const today = new Date().toLocaleString("sv").split("T")[0]; // YYYY-MM-DD

    const baseValues = {
      name: isEditing && automation ? automation.name : `Webhook ${today}`,
      eventSource: automation
        ? automation.trigger.eventSource
        : TriggerEventSource.Prompt,
      eventAction: automation
        ? automation.trigger.eventActions
        : ["created", "updated", "deleted"],
      status: (isEditing && automation
        ? automation.trigger.status
        : "ACTIVE") as "ACTIVE" | "INACTIVE",
      filter: automation ? automation.trigger.filter || [] : [],
    };

    if (actionType === "WEBHOOK") {
      // Use action handler to get default values with proper typing
      const handler = ActionHandlerRegistry.getHandler("WEBHOOK");
      const webhookDefaults = handler.getDefaultValues(automation);
      return {
        ...baseValues,
        actionType: "WEBHOOK" as const,
        eventSource: TriggerEventSource.Prompt,
        webhook: {
          url: webhookDefaults.webhook.url || "",
          headers: webhookDefaults.webhook.headers || [],
          apiVersion: webhookDefaults.webhook.apiVersion || {
            prompt: "v1" as const,
          },
        },
      };
    } else {
      throw new Error("Invalid action type");
    }
  };

  // Initialize form with default values or values from existing automation
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(),
  });

  // Set the active tab based on the action type
  useEffect(() => {
    if (isEditing && automation?.action?.type) {
      setActiveTab(automation.action.type.toLowerCase());
    }
  }, [isEditing, automation]);

  // Handle form submission
  const onSubmit = async (data: FormValues) => {
    if (!hasAccess) {
      showErrorToast(
        "Permission Denied",
        "You don't have permission to modify automations.",
      );
      return;
    }

    // Use action handler to validate and build config
    const handler = ActionHandlerRegistry.getHandler(data.actionType);
    const validation = handler.validateFormData(data);

    if (!validation.isValid) {
      showErrorToast(
        "Validation Error",
        validation.errors?.join(", ") || "Please fill in all required fields",
      );
      return;
    }

    const actionConfig = handler.buildActionConfig(data);

    if (isEditing && automation) {
      // Update existing automation
      await updateAutomationMutation.mutateAsync({
        projectId,
        automationId: automation.id,
        name: data.name,
        eventSource: data.eventSource,
        eventAction: data.eventAction,
        filter: data.filter && data.filter.length > 0 ? data.filter : null,
        status: data.status as JobConfigState,
        actionType: data.actionType,
        actionConfig: actionConfig,
      });

      showSuccessToast({
        title: "Automation Updated",
        description: `Successfully updated automation "${data.name}".`,
      });

      onSuccess?.(automation.id);
    } else {
      // Create new automation
      const result = await createAutomationMutation.mutateAsync({
        projectId,
        name: data.name,
        eventSource: data.eventSource,
        eventAction: data.eventAction,
        filter: data.filter && data.filter.length > 0 ? data.filter : null,
        status: data.status as JobConfigState,
        actionType: data.actionType,
        actionConfig: actionConfig,
      });

      showSuccessToast({
        title: "Automation Created",
        description: `Successfully created automation "${data.name}".`,
      });

      onSuccess?.(result.automation.id, result.webhookSecret);
    }
  };

  // Update button text based on if we're editing an existing automation
  const submitButtonText =
    isEditing && automation ? "Update Webhook" : "Save Webhook";

  // Update required fields based on action type
  const handleActionTypeChange = (value: ActionTypes) => {
    setActiveTab(value.toLowerCase());
    form.setValue("actionType", value);
    const handler = ActionHandlerRegistry.getHandler("WEBHOOK");
    const defaultValues = handler.getDefaultValues();
    form.setValue("webhook", defaultValues.webhook);
  };

  // Handle cancel button click
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push(`/project/${projectId}/settings/automations`);
    }
  };

  // Get current action handler for rendering
  const getCurrentActionHandler = () => {
    try {
      const actionType = form.watch("actionType");
      return ActionHandlerRegistry.getHandler(actionType);
    } catch (error) {
      console.error("Failed to get action handler:", error);
      return null;
    }
  };

  const currentActionHandler = getCurrentActionHandler();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {isEditing && (
          <div className="mb-6 flex items-center gap-4">
            <div className="flex-1">
              <FormField
                control={form.control}
                name="name"
                rules={{ required: "Name is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="Automation name"
                        {...field}
                        disabled={!hasAccess || !isEditing}
                        className="rounded-none border-0 border-b border-border bg-transparent px-0 text-2xl font-semibold focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2">
                  <FormLabel className="text-sm font-medium">Active</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value === "ACTIVE"}
                      onCheckedChange={(checked) =>
                        field.onChange(checked ? "ACTIVE" : "INACTIVE")
                      }
                      disabled={!hasAccess || !isEditing}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Trigger</CardTitle>
            <CardDescription>
              Configure when this automation should run.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="eventSource"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Source</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!hasAccess || !isEditing}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an event source" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={TriggerEventSource.Prompt}>
                        Prompt
                      </SelectItem>
                      <SelectItem disabled={true} value="planned">
                        More coming soon...
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    The event that triggers this automation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="eventAction"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Action</FormLabel>
                  <FormControl>
                    <MultiSelect
                      title="Event Actions"
                      label="Actions"
                      values={field.value}
                      onValueChange={field.onChange}
                      options={[
                        {
                          value: "created",
                          description:
                            "Whenever a new prompt version is created",
                        },
                        {
                          value: "updated",
                          description:
                            "Whenever tags or labels on a prompt version are updated",
                        },
                        {
                          value: "deleted",
                          description: "Whenever a prompt version is deleted",
                        },
                      ]}
                      className="my-0 w-auto overflow-hidden"
                      disabled={!hasAccess || !isEditing}
                      labelTruncateCutOff={4}
                    />
                  </FormControl>
                  <FormDescription>
                    The actions on the event source that trigger this
                    automation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="filter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Filter</FormLabel>
                  <FormControl>
                    <InlineFilterBuilder
                      columns={webhookActionFilterOptions()}
                      filterState={field.value || []}
                      onChange={field.onChange}
                      disabled={
                        activeTab === "annotation_queue" ||
                        !hasAccess ||
                        !isEditing
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Add conditions to narrow down when this trigger fires.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Action</CardTitle>
            <CardDescription>
              Configure what happens when the trigger fires.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="actionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Action Type</FormLabel>
                  <Select
                    onValueChange={handleActionTypeChange}
                    value={field.value}
                    disabled={!hasAccess || !isEditing}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an action type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ActionHandlerRegistry.getAllActionTypes().map(
                        (actionType) => (
                          <SelectItem key={actionType} value={actionType}>
                            {actionType === "WEBHOOK"
                              ? "Webhook"
                              : "Annotation Queue"}
                          </SelectItem>
                        ),
                      )}
                      <SelectItem disabled={true} value="planned">
                        More coming soon...
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    The type of action to perform when the trigger fires.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator className="my-4" />

            {currentActionHandler &&
              currentActionHandler.renderForm({
                form,
                disabled: !hasAccess || !isEditing,
                projectId,
                action: automation?.action,
              })}
          </CardContent>
        </Card>

        {isEditing && (
          <div className="flex justify-between gap-3">
            {isEditing && automation?.trigger.id && automation?.action.id && (
              <div>
                <DeleteAutomationButton
                  projectId={projectId}
                  automationId={automation.id}
                  variant="button"
                  onSuccess={() => {
                    utils.automations.invalidate();
                    router.push(`/project/${projectId}/settings/automations`);
                  }}
                />
              </div>
            )}
            <div className="flex-grow"></div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!hasAccess || form.formState.isSubmitting}
              >
                {submitButtonText}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Form>
  );
};
