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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { Textarea } from "@/src/components/ui/textarea";
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
import { type ActionType, type JobConfigState } from "@langfuse/shared";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type ColumnDefinition } from "@langfuse/shared";
import { DeleteAutomationButton } from "./DeleteAutomationButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

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
const formSchema = z.object({
  description: z.string().min(1, "Description is required").max(100),
  eventSource: z.string().min(1, "Event source is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  sampling: z.coerce.number().min(0).max(100).default(100),
  delay: z.coerce.number().min(0).default(0),
  filter: z.array(z.any()).optional(),
  actionType: z.enum(["WEBHOOK", "ANNOTATION_QUEUE"]),
  // Action specific fields
  webhook: z
    .object({
      url: z.string().url("Invalid URL").optional(),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("POST"),
      headers: z.string().optional(),
    })
    .optional(),
  annotationQueue: z
    .object({
      queueId: z.string().optional(),
    })
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AutomationFormProps {
  projectId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  automation?: any; // The automation being edited
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

  // Set up mutations
  const createAutomationMutation =
    api.automations.createAutomation.useMutation();
  const updateAutomationMutation =
    api.automations.updateAutomation.useMutation();
  const deleteAutomationMutation = api.automations.deleteAutomation.useMutation(
    {
      onSuccess: () => {
        showSuccessToast({
          title: "Automation deleted",
          description: "The automation has been deleted successfully.",
        });
        utils.automations.getAutomations.invalidate({ projectId });
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(`/project/${projectId}/automations/list`);
        }
      },
    },
  );

  // Parse the filter if it exists for editing
  const getInitialFilter = () => {
    if (isEditing && automation?.filter) {
      try {
        return JSON.parse(automation.filter);
      } catch (e) {
        console.error("Failed to parse filter:", e);
        return [];
      }
    }
    return [];
  };

  // Get the action type for the form when editing
  const getActionType = () => {
    if (isEditing && automation?.action?.type) {
      return automation.action.type as "WEBHOOK" | "ANNOTATION_QUEUE";
    }
    return "WEBHOOK";
  };

  // Initialize form with default values or values from existing automation
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: isEditing ? automation?.description || "" : "",
      eventSource: isEditing
        ? automation?.eventSource
        : TriggerEventSource.ObservationCreated,
      status: isEditing ? automation?.status : "ACTIVE",
      sampling: isEditing
        ? Math.round(automation?.sampling.toNumber() * 100)
        : 100,
      delay: isEditing ? automation?.delay : 0,
      filter: getInitialFilter(),
      actionType: getActionType(),
      webhook: {
        url: (isEditing && automation?.action?.config?.url) || "",
        method: (isEditing && automation?.action?.config?.method) || "POST",
        headers:
          isEditing && automation?.action?.config?.headers
            ? JSON.stringify(automation.action.config.headers)
            : "",
      },
      annotationQueue: {
        queueId: (isEditing && automation?.action?.config?.queueId) || "",
      },
    },
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
      // Format the data for the API
      const actionConfig =
        data.actionType === "WEBHOOK"
          ? {
              version: "1.0",
              url: data.webhook?.url,
              method: data.webhook?.method,
              headers: data.webhook?.headers
                ? JSON.parse(data.webhook.headers)
                : {},
            }
          : {
              version: "1.0",
              queueId: data.annotationQueue?.queueId,
            };

      if (isEditing && automation) {
        // Update existing automation
        await updateAutomationMutation.mutateAsync({
          projectId,
          triggerId: automation.id,
          actionId: automation.action.id,
          description: data.description,
          eventSource: data.eventSource,
          filter: data.filter && data.filter.length > 0 ? data.filter : null,
          status: data.status as JobConfigState,
          sampling: data.sampling / 100, // Convert to decimal (0-1)
          delay: data.delay,
          actionType: data.actionType as ActionType,
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
          actionType: data.actionType as ActionType,
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
  };

  // Handle cancel button click
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push(`/project/${projectId}/automations/list`);
    }
  };

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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
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
                    defaultValue={field.value}
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
                    defaultValue={field.value}
                    disabled={!hasAccess}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an action type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="WEBHOOK">Webhook</SelectItem>
                      <SelectItem value="ANNOTATION_QUEUE">
                        Annotation Queue
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

            {activeTab === "webhook" && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="webhook.url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Webhook URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/webhook"
                          {...field}
                          disabled={!hasAccess}
                        />
                      </FormControl>
                      <FormDescription>
                        The URL to call when the trigger fires.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="webhook.method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>HTTP Method</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={!hasAccess}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select HTTP method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="GET">GET</SelectItem>
                          <SelectItem value="POST">POST</SelectItem>
                          <SelectItem value="PUT">PUT</SelectItem>
                          <SelectItem value="DELETE">DELETE</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The HTTP method to use for the webhook request.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="webhook.headers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Headers (JSON)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_TOKEN"}'
                          className="font-mono text-sm"
                          {...field}
                          disabled={!hasAccess}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional JSON object with headers to include in the
                        webhook request.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {activeTab === "annotation_queue" && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="annotationQueue.queueId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Annotation Queue</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={!hasAccess}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an annotation queue" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {/* Dynamically populate with available queues */}
                          <SelectItem value="queue1">Queue 1</SelectItem>
                          <SelectItem value="queue2">Queue 2</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The annotation queue to add items to when the trigger
                        fires.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between gap-3">
          {isEditing && (
            <div>
              <DeleteAutomationButton
                projectId={projectId}
                triggerId={automation.id}
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
            <Button type="submit" disabled={!hasAccess}>
              {submitButtonText}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};
