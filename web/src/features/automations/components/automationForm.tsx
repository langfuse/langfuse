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
import { z } from "zod";
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
import { type ActionTypes, type JobConfigState } from "@langfuse/shared";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type ColumnDefinition } from "@langfuse/shared";
import { DeleteAutomationButton } from "./DeleteAutomationButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { type ActiveAutomation } from "@langfuse/shared/src/server";
import { ActionHandlerRegistry } from "./actions";

import { webhookSchema } from "./actions/WebhookActionForm";
import { annotationQueueSchema } from "./actions/AnnotationQueueActionForm";

// Define the TriggerEventSource enum directly in this file to match the backend
enum TriggerEventSource {
  ObservationCreated = "observation.created",
}

// Define columns for observation events
export const observationFilterColumns: ColumnDefinition[] = [
  { name: "name", id: "name", type: "string", internal: "name" },
  {
    name: "type",
    id: "type",
    type: "stringOptions",
    options: [{ value: "GENERATION" }, { value: "SPAN" }, { value: "EVENT" }],
    internal: "type",
  },
  { name: "model", id: "model", type: "string", internal: "model" },
  {
    name: "startTime",
    id: "startTime",
    type: "datetime",
    internal: "startTime",
  },
  {
    name: "totalTokens",
    id: "totalTokens",
    type: "number",
    internal: "totalTokens",
  },
  {
    name: "promptTokens",
    id: "promptTokens",
    type: "number",
    internal: "promptTokens",
  },
  {
    name: "completionTokens",
    id: "completionTokens",
    type: "number",
    internal: "completionTokens",
  },
  {
    name: "calculatedTotalCost",
    id: "calculatedTotalCost",
    type: "number",
    internal: "calculatedTotalCost",
  },
];

// Define schemas for form validation
const baseFormSchema = z.object({
  description: z.string().min(1, "Description is required").max(100),
  eventSource: z.string().min(1, "Event source is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  sampling: z.coerce.number().min(0).max(100).default(100),
  delay: z.coerce.number().min(0).default(0),
  filter: z.array(z.any()).optional(),
});

const formSchema = z.discriminatedUnion("actionType", [
  baseFormSchema.extend({
    actionType: z.literal("WEBHOOK"),
    webhook: webhookSchema,
  }),
  baseFormSchema.extend({
    actionType: z.literal("ANNOTATION_QUEUE"),
    annotationQueue: annotationQueueSchema,
  }),
]);

type FormValues = z.infer<typeof formSchema>;

interface AutomationFormProps {
  projectId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  automation?: ActiveAutomation;
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
      return automation.action.type as "WEBHOOK" | "ANNOTATION_QUEUE";
    }
    return "WEBHOOK";
  };

  // Get default values based on action type
  const getDefaultValues = (): Partial<FormValues> => {
    const actionType = getActionType();
    const baseValues = {
      description: isEditing ? automation?.trigger?.description || "" : "",
      eventSource: isEditing
        ? automation?.trigger?.eventSource
        : TriggerEventSource.ObservationCreated,
      status: isEditing ? automation?.trigger?.status : "ACTIVE",
      sampling: isEditing
        ? Math.round((automation?.trigger?.sampling?.toNumber() || 0) * 100)
        : 100,
      delay: isEditing ? automation?.trigger?.delay : 0,
      filter: isEditing ? automation?.trigger?.filter : [],
      actionType,
    };

    if (actionType === "WEBHOOK") {
      // Use action handler to get default values with proper typing
      const handler = ActionHandlerRegistry.getHandler("WEBHOOK");
      const webhookDefaults = handler.getDefaultValues(automation);
      return {
        ...baseValues,
        webhook: webhookDefaults.webhook,
      };
    } else {
      // Use action handler to get default values with proper typing
      const handler = ActionHandlerRegistry.getHandler("ANNOTATION_QUEUE");
      const annotationQueueDefaults = handler.getDefaultValues(automation);
      return {
        ...baseValues,
        annotationQueue: annotationQueueDefaults.annotationQueue,
      };
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
      showSuccessToast({
        title: "Permission Denied",
        description: "You don't have permission to modify automations.",
      });
      return;
    }

    try {
      // Use action handler to validate and build config
      const handler = ActionHandlerRegistry.getHandler(data.actionType);
      const validation = handler.validateFormData(data);

      if (!validation.isValid) {
        showSuccessToast({
          title: "Validation Error",
          description:
            validation.errors?.join(", ") ||
            "Please fill in all required fields",
        });
        return;
      }

      const actionConfig = handler.buildActionConfig(data);

      if (isEditing && automation) {
        // Update existing automation
        await updateAutomationMutation.mutateAsync({
          projectId,
          triggerId: automation.trigger.id,
          actionId: automation.action.id,
          description: data.description,
          eventSource: data.eventSource,
          filter: data.filter && data.filter.length > 0 ? data.filter : null,
          status: data.status as JobConfigState,
          sampling: data.sampling / 100, // Convert to decimal (0-1)
          delay: data.delay,
          actionType: data.actionType,
          actionConfig: actionConfig,
        });
      } else {
        // Create new automation
        await createAutomationMutation.mutateAsync({
          projectId,
          description: data.description,
          eventSource: data.eventSource,
          filter: data.filter && data.filter.length > 0 ? data.filter : null,
          status: data.status as JobConfigState,
          sampling: data.sampling / 100, // Convert to decimal (0-1)
          delay: data.delay,
          actionType: data.actionType,
          actionName: data.description,
          actionConfig: actionConfig,
        });
      }

      // Call onSuccess or redirect to the automations list page
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/project/${projectId}/automations/list`);
      }
    } catch (error) {
      console.error("Failed to save automation:", error);
      showSuccessToast({
        title: "Error",
        description: "Failed to save automation. Please try again.",
      });
    }
  };

  // Update button text based on if we're editing
  const submitButtonText = isEditing
    ? "Update Automation"
    : "Create Automation";

  // Update required fields based on action type
  const handleActionTypeChange = (value: string) => {
    setActiveTab(value.toLowerCase());
    form.setValue("actionType", value as "WEBHOOK" | "ANNOTATION_QUEUE");

    // Clear the fields for the action type we're switching away from and set defaults for the new type
    if (value === "WEBHOOK") {
      // Clear annotation queue fields and set webhook defaults
      form.unregister("annotationQueue");
      form.setValue("webhook", { url: "", headers: [] });
    } else if (value === "ANNOTATION_QUEUE") {
      // Clear webhook fields and set annotation queue defaults
      form.unregister("webhook");
      form.setValue("annotationQueue", { queueId: "" });
    }
  };

  // Handle cancel button click
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push(`/project/${projectId}/automations/list`);
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
        <Card>
          <CardHeader>
            <CardTitle>Automation Details</CardTitle>
            <CardDescription>
              Configure the basic settings for your automation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              rules={{ required: "Description is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    Description <span className="ml-1 text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Notify Slack when an observation is created"
                      {...field}
                      disabled={!hasAccess}
                    />
                  </FormControl>
                  <FormDescription>
                    A brief description of what this automation does.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <FormDescription>
                      Enable or disable this automation.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value === "ACTIVE"}
                      onCheckedChange={(checked) =>
                        field.onChange(checked ? "ACTIVE" : "INACTIVE")
                      }
                      disabled={!hasAccess}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

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
                    disabled={!hasAccess}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an event source" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={TriggerEventSource.ObservationCreated}>
                        Observation Created
                      </SelectItem>
                      {/* Add more event sources as they become available */}
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
              name="filter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Filter</FormLabel>
                  <FormControl>
                    <InlineFilterBuilder
                      columns={observationFilterColumns}
                      filterState={field.value || []}
                      onChange={field.onChange}
                      disabled={activeTab === "annotation_queue" || !hasAccess}
                    />
                  </FormControl>
                  <FormDescription>
                    Add conditions to narrow down when this trigger fires.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sampling"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sampling Rate (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        {...field}
                        disabled={!hasAccess}
                      />
                    </FormControl>
                    <FormDescription>
                      The percentage of events that will trigger this
                      automation.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="delay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delay (ms)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        {...field}
                        disabled={!hasAccess}
                      />
                    </FormControl>
                    <FormDescription>
                      Delay in milliseconds before the action is executed.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
                    disabled={!hasAccess}
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
                disabled: !hasAccess,
                projectId,
              })}
          </CardContent>
        </Card>

        <div className="flex justify-between gap-3">
          {isEditing && automation?.trigger.id && automation?.action.id && (
            <div>
              <DeleteAutomationButton
                projectId={projectId}
                triggerId={automation.trigger.id}
                actionId={automation.action.id}
                variant="button"
                onSuccess={() => {
                  if (onSuccess) {
                    onSuccess();
                  } else {
                    router.push(`/project/${projectId}/automations/list`);
                  }
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
      </form>
    </Form>
  );
};
