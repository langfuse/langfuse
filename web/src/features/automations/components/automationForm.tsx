import React, { useMemo } from "react";
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
import { type Control, useForm } from "react-hook-form";
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
  ActionTypeSchema,
  type FilterState,
  type JobConfigState,
  TriggerEventSource,
  TriggerEventSourceSchema,
  webhookActionFilterOptions,
} from "@langfuse/shared";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { DeleteAutomationButton } from "./DeleteAutomationButton";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { ActionHandlerRegistry } from "./actions";
import { webhookSchema } from "./actions/WebhookActionForm";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import TagManager from "@/src/features/tag/components/TagManager";
import { Plus } from "lucide-react";

// Define Slack action schema
const slackSchema = z.object({
  channelId: z.string().min(1, "Channel is required"),
  channelName: z.string().min(1, "Channel name is required"),
  messageTemplate: z.string().optional(),
});

// Define GitHub Dispatch action schema
const githubDispatchSchema = z.object({
  url: z.url("Invalid URL"),
  eventType: z.string().min(1, "Event type is required").max(100),
  githubToken: z.string(),
  displayGitHubToken: z.string().optional(),
});

/** promptEventActionDefaults is the default eventAction set for a fresh prompt-source automation. */
const promptEventActionDefaults: string[] = ["created", "updated", "deleted"];

/** CreateAutomationPrefill pre-fills the create-automation form from a deep link. */
export type CreateAutomationPrefill = {
  eventSource?: TriggerEventSource;
  filter?: FilterState;
  actionType?: ActionTypes;
};

/** createAutomationPrefillSchema validates a decoded prefill payload. */
const createAutomationPrefillSchema = z.object({
  eventSource: TriggerEventSourceSchema.optional(),
  filter: z.array(z.any()).optional(),
  actionType: ActionTypeSchema.optional(),
});

/** parseCreateAutomationPrefill decodes a base64url JSON blob into a typed prefill; returns {} when absent or malformed. */
export const parseCreateAutomationPrefill = (
  raw: string | null | undefined,
): CreateAutomationPrefill => {
  if (!raw) return {};
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded);
    const result = createAutomationPrefillSchema.safeParse(JSON.parse(decoded));
    return result.success ? (result.data as CreateAutomationPrefill) : {};
  } catch {
    return {};
  }
};

/** serializeCreateAutomationPrefill encodes a typed prefill as a base64url JSON blob for a single URL query param. */
export const serializeCreateAutomationPrefill = (
  prefill: CreateAutomationPrefill,
): string =>
  btoa(JSON.stringify(prefill))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// Define schemas for form validation
const baseFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  eventSource: z.string().min(1, "Event source is required"),
  eventAction: z.array(z.string()),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  filter: z.array(z.any()).optional(),
});

const formSchema = z
  .discriminatedUnion("actionType", [
    baseFormSchema.extend({
      actionType: z.literal("WEBHOOK"),
      webhook: webhookSchema,
    }),
    baseFormSchema.extend({
      actionType: z.literal("SLACK"),
      slack: slackSchema,
    }),
    baseFormSchema.extend({
      actionType: z.literal("GITHUB_DISPATCH"),
      githubDispatch: githubDispatchSchema,
    }),
  ])
  .superRefine((data, ctx) => {
    // Prompt-source triggers require at least one event action; monitor-source triggers don't use this field.
    if (
      data.eventSource === TriggerEventSource.Prompt &&
      data.eventAction.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["eventAction"],
        message: "At least one event action is required",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

/** EventSourceField renders the trigger source picker and routes changes through onSourceChange so the parent can reset dependent fields. */
const EventSourceField = ({
  control,
  onSourceChange,
  disabled,
}: {
  control: Control<FormValues>;
  onSourceChange: (value: TriggerEventSource) => void;
  disabled: boolean;
}) => {
  const isMonitorsEnabled = useIsFeatureEnabled("monitors");
  return (
    <FormField
      control={control}
      name="eventSource"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Event Source</FormLabel>
          <Select
            onValueChange={(value) =>
              onSourceChange(value as TriggerEventSource)
            }
            value={field.value}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select an event source" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={TriggerEventSource.Prompt}>Prompt</SelectItem>
              {(isMonitorsEnabled ||
                field.value === TriggerEventSource.Monitor) && (
                <SelectItem value={TriggerEventSource.Monitor}>
                  Monitor
                </SelectItem>
              )}
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
  );
};

/** PromptTriggerFields renders the eventAction picker and inline filter builder for prompt-source automations. */
const PromptTriggerFields = ({
  control,
  disabled,
}: {
  control: Control<FormValues>;
  disabled: boolean;
}) => (
  <>
    <FormField
      control={control}
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
                  description: "Whenever a new prompt version is created",
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
              disabled={disabled}
              labelTruncateCutOff={4}
            />
          </FormControl>
          <FormDescription>
            The actions on the event source that trigger this automation.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
    <FormField
      control={control}
      name="filter"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Filter</FormLabel>
          <FormControl>
            <InlineFilterBuilder
              columns={webhookActionFilterOptions()}
              filterState={field.value || []}
              onChange={field.onChange}
              disabled={disabled}
            />
          </FormControl>
          <FormDescription>
            Add conditions to narrow down when this trigger fires.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  </>
);

/** filterToTags extracts the tag list from a monitor-source trigger filter, if a tags clause is present. */
const filterToTags = (filter: FilterState): string[] => {
  for (const cond of filter) {
    if (
      cond.column === "tags" &&
      cond.type === "arrayOptions" &&
      cond.operator === "all of"
    ) {
      return cond.value as string[];
    }
  }
  return [];
};

/** tagsToFilter encodes a tag list as the FilterState a monitor-source trigger expects. */
const tagsToFilter = (tags: string[]): FilterState =>
  tags.length === 0
    ? []
    : [
        {
          column: "tags",
          type: "arrayOptions",
          operator: "all of",
          value: tags,
        },
      ];

/** MonitorTriggerFields renders the tag picker for monitor-source automations, loading suggestions from the project's existing monitor tags. */
const MonitorTriggerFields = ({
  control,
  projectId,
  disabled,
}: {
  control: Control<FormValues>;
  projectId: string;
  disabled: boolean;
}) => {
  /** monitorTagsQuery loads existing monitor tags for TagManager autocomplete. */
  const monitorTagsQuery = api.monitors.getFilterOptions.useQuery(
    { projectId },
    {
      trpc: { context: { skipBatch: true } },
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  /** availableTags is the flat list of tag values pulled from monitorTagsQuery for TagManager. */
  const availableTags = useMemo(
    () => monitorTagsQuery.data?.tags.map((t) => t.value) ?? [],
    [monitorTagsQuery.data],
  );

  return (
    <FormField
      control={control}
      name="filter"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Monitor Tags</FormLabel>
          <FormControl>
            <TagManager
              itemName="monitor"
              tags={filterToTags((field.value ?? []) as FilterState)}
              allTags={availableTags}
              hasAccess={!disabled}
              isLoading={false}
              mutateTags={(next) => field.onChange(tagsToFilter(next))}
              alignPopover="start"
              triggerButton={
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="mr-2 ml-0.5 gap-1"
                  disabled={disabled}
                >
                  <Plus className="h-3 w-3" />
                  Add Tags
                </Button>
              }
            />
          </FormControl>
          <FormDescription>
            Fire on monitors carrying all of the selected tags. Leave empty to
            fire on every monitor in the project.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

interface AutomationFormProps {
  projectId: string;
  onSuccess?: (
    automationId?: string,
    webhookSecret?: string,
    actionType?: "WEBHOOK" | "GITHUB_DISPATCH",
  ) => void;
  onCancel?: () => void;
  /** automation is the existing record being edited. Mutually exclusive with prefill in practice. */
  automation?: AutomationDomain;
  isEditing?: boolean;
  /** prefill is a raw base64url JSON deep-link blob; the form decodes it. Ignored when automation is set. */
  prefill?: string | null;
}

export const AutomationForm = ({
  projectId,
  onSuccess,
  onCancel,
  automation,
  isEditing = false,
  prefill,
}: AutomationFormProps) => {
  const router = useRouter();
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

  // Decoded prefill values; empty when editing an existing automation or when the blob is absent/malformed.
  const parsedPrefill: CreateAutomationPrefill = automation
    ? {}
    : parseCreateAutomationPrefill(prefill);

  // Get the action type for the form when editing
  const getActionType = (): ActionTypes =>
    (automation?.action.type as ActionTypes | undefined) ??
    parsedPrefill.actionType ??
    "WEBHOOK";

  // Get default values based on action type
  const getDefaultValues = (): FormValues => {
    const actionType = getActionType();
    const today = new Date().toLocaleString("sv").split("T")[0]; // YYYY-MM-DD

    const resolvedEventSource: TriggerEventSource =
      automation?.trigger.eventSource ??
      parsedPrefill.eventSource ??
      TriggerEventSource.Prompt;

    const resolvedEventAction: string[] =
      automation?.trigger.eventActions ??
      (resolvedEventSource === TriggerEventSource.Monitor
        ? []
        : promptEventActionDefaults);

    const resolvedFilter: FilterState =
      automation?.trigger.filter ?? parsedPrefill.filter ?? [];

    const baseValues = {
      name:
        isEditing && automation ? automation.name : `${actionType} ${today}`,
      eventSource: resolvedEventSource,
      eventAction: resolvedEventAction,
      status: (isEditing && automation
        ? automation.trigger.status
        : "ACTIVE") as "ACTIVE" | "INACTIVE",
      filter: resolvedFilter,
    };

    if (actionType === "WEBHOOK") {
      // Use action handler to get default values with proper typing
      const handler = ActionHandlerRegistry.getHandler("WEBHOOK");
      const webhookDefaults = handler.getDefaultValues(automation);
      return {
        ...baseValues,
        actionType: "WEBHOOK" as const,
        webhook: {
          url: webhookDefaults.webhook.url || "",
          headers: webhookDefaults.webhook.headers || [],
          apiVersion: webhookDefaults.webhook.apiVersion || {
            prompt: "v1" as const,
          },
        },
      };
    } else if (actionType === "SLACK") {
      // Use action handler to get default values with proper typing
      const handler = ActionHandlerRegistry.getHandler("SLACK");
      const slackDefaults = handler.getDefaultValues(automation);
      return {
        ...baseValues,
        actionType: "SLACK" as const,
        slack: {
          channelId: slackDefaults.slack.channelId || "",
          channelName: slackDefaults.slack.channelName || "",
          messageTemplate: slackDefaults.slack.messageTemplate || "",
        },
      };
    } else if (actionType === "GITHUB_DISPATCH") {
      // Use action handler to get default values with proper typing
      const handler = ActionHandlerRegistry.getHandler("GITHUB_DISPATCH");
      const githubDefaults = handler.getDefaultValues(automation);
      return {
        ...baseValues,
        actionType: "GITHUB_DISPATCH" as const,
        githubDispatch: {
          url: githubDefaults.githubDispatch.url || "",
          eventType: githubDefaults.githubDispatch.eventType || "",
          githubToken: githubDefaults.githubDispatch.githubToken || "",
          displayGitHubToken:
            githubDefaults.githubDispatch.displayGitHubToken || undefined,
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

      onSuccess?.(
        result.automation.id,
        result.webhookSecret,
        data.actionType as "WEBHOOK" | "GITHUB_DISPATCH",
      );
    }
  };

  // Update button text based on if we're editing an existing automation
  const submitButtonText =
    isEditing && automation ? "Update Automation" : "Save Automation";

  // Update required fields based on action type
  const handleActionTypeChange = (value: ActionTypes) => {
    form.setValue("actionType", value);

    if (value === "WEBHOOK") {
      const handler = ActionHandlerRegistry.getHandler("WEBHOOK");
      const defaultValues = handler.getDefaultValues();
      form.setValue("webhook", defaultValues.webhook);
    } else if (value === "SLACK") {
      const handler = ActionHandlerRegistry.getHandler("SLACK");
      const defaultValues = handler.getDefaultValues();
      form.setValue("slack", defaultValues.slack);
    } else if (value === "GITHUB_DISPATCH") {
      const handler = ActionHandlerRegistry.getHandler("GITHUB_DISPATCH");
      const defaultValues = handler.getDefaultValues();
      form.setValue("githubDispatch", defaultValues.githubDispatch);
    }

    // If we are creating a new automation, update the default name
    if (!automation) {
      const today = new Date().toLocaleString("sv").split("T")[0];
      form.setValue("name", `${value} ${today}`);
    }
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

  /** watchedEventSource drives the conditional trigger UI (prompt → filter builder, monitor → tag picker). */
  const watchedEventSource = form.watch("eventSource") as TriggerEventSource;

  /** handleEventSourceChange resets eventAction + filter to defaults appropriate for the picked source. */
  const handleEventSourceChange = (value: TriggerEventSource) => {
    form.setValue("eventSource", value);
    if (value === TriggerEventSource.Monitor) {
      form.setValue("eventAction", []);
    } else {
      form.setValue("eventAction", promptEventActionDefaults);
    }
    form.setValue("filter", []);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-6">
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
                        className="border-border rounded-none border-0 border-b bg-transparent px-0 text-2xl font-semibold focus-visible:ring-0 focus-visible:ring-offset-0"
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
            <EventSourceField
              control={form.control}
              onSourceChange={handleEventSourceChange}
              disabled={!hasAccess || !isEditing}
            />
            {watchedEventSource === TriggerEventSource.Monitor ? (
              <MonitorTriggerFields
                control={form.control}
                projectId={projectId}
                disabled={!hasAccess || !isEditing}
              />
            ) : (
              <PromptTriggerFields
                control={form.control}
                disabled={!hasAccess || !isEditing}
              />
            )}
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
                              : actionType === "SLACK"
                                ? "Slack"
                                : actionType === "GITHUB_DISPATCH"
                                  ? "GitHub Dispatch"
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
            <div className="grow"></div>
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
