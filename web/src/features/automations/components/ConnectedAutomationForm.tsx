import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useState, type ComponentProps } from "react";
import { AutomationForm } from "./AutomationForm/AutomationForm";
import { useRouter } from "next/router";
import { z } from "zod";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/src/utils/api";
import {
  type AutomationDomain,
  type ActionTypes,
  ActionTypeSchema,
  type FilterState,
  type JobConfigState,
  ProjectNotificationEventTypeSchema,
  TriggerEventSource,
  TriggerEventSourceSchema,
  webhookActionFilterOptions,
} from "@langfuse/shared";
import {
  PagerDutyRegionSchema,
  PagerDutyRoutingKeySchema,
} from "@langfuse/shared/pagerduty";
import { DeleteAutomationDialogController } from "./DeleteAutomationDialogController";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ActionHandlerRegistry } from "@/src/features/automations/components/actions/ActionHandlerRegistry";
import { webhookSchema } from "./actions/WebhookActionForm";
import { useVersionFilterOptions } from "../hooks/useVersionFilterOptions";

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
  originalUrl: z.string().optional(),
});

// Define PagerDuty action schema; an empty routing key keeps the stored one on edit
const pagerDutySchema = z.object({
  routingKey: z.union([z.literal(""), PagerDutyRoutingKeySchema]),
  displayRoutingKey: z.string().optional(),
  region: PagerDutyRegionSchema,
});

/** versionEventActionDefaults is the default eventAction set for a fresh version-source automation. */
const versionEventActionDefaults: string[] = ["created", "updated", "deleted"];

/** projectNotificationName derives the auto-generated channel name from the destination — the name field is hidden for this source. */
const projectNotificationName = (data: FormValues): string => {
  // Automation names are visible to every project member, so they must not
  // carry Slack channel names (private ones are only for channel members).
  if (data.actionType === "SLACK") return "Slack";
  if (data.actionType === "PAGERDUTY") return "PagerDuty";
  if (data.actionType === "WEBHOOK") {
    try {
      return `Webhook ${new URL(data.webhook.url).hostname}`;
    } catch {
      return "Webhook";
    }
  }
  return "Project notification";
};

/** CreateAutomationPrefill pre-fills the create-automation form from a deep link. */
export type CreateAutomationPrefill = {
  eventSource?: TriggerEventSource;
  filter?: FilterState;
  actionType?: ActionTypes;
  /** redirectUrl is a same-origin path the caller wants to return to after the automation is saved. */
  redirectUrl?: string;
};

/** isSameOriginRedirect resolves a candidate URL against the current Next-rendered origin and accepts it only if the resulting origin still matches; falls back to path-only validation during SSR where `window` is absent. */
const isSameOriginRedirect = (url: string): boolean => {
  if (url.startsWith("//")) return false;
  if (typeof window === "undefined") {
    // Without window we cannot resolve absolute URLs; trust relative paths only.
    return url.startsWith("/") && !url.includes("\\");
  }
  try {
    const resolved = new URL(url, window.location.origin);
    return resolved.origin === window.location.origin;
  } catch {
    return false;
  }
};

/** safeRedirectPath defends against open-redirect by requiring the URL to resolve back to the current origin. */
const safeRedirectPath = z.string().refine(isSameOriginRedirect, {
  message: "redirectUrl must resolve to the same origin",
});

/** createAutomationPrefillSchema validates a decoded prefill payload. */
const createAutomationPrefillSchema = z.object({
  eventSource: TriggerEventSourceSchema.optional(),
  filter: z.array(z.any()).optional(),
  actionType: ActionTypeSchema.optional(),
  redirectUrl: safeRedirectPath.optional(),
});

/** parseCreateAutomationPrefill decodes a base64url JSON blob into a typed prefill; returns {} when absent or malformed. */
export const parseCreateAutomationPrefill = (
  raw: string | null | undefined,
): CreateAutomationPrefill => {
  if (!raw) return {};
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const decoded = new TextDecoder().decode(bytes);
    const result = createAutomationPrefillSchema.safeParse(JSON.parse(decoded));
    return result.success ? (result.data as CreateAutomationPrefill) : {};
  } catch {
    return {};
  }
};

// Define schemas for form validation
const baseFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  eventSource: TriggerEventSourceSchema,
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
    baseFormSchema.extend({
      actionType: z.literal("PAGERDUTY"),
      pagerDuty: pagerDutySchema,
    }),
  ])
  .superRefine((data, ctx) => {
    // Prompt and skill triggers require at least one event action; monitor and
    // project-notification sources don't use this field (project-notification
    // triggers are match-all).
    if (
      (data.eventSource === TriggerEventSource.Prompt ||
        data.eventSource === TriggerEventSource.Skill) &&
      data.eventAction.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["eventAction"],
        message: "At least one event action is required",
      });
    }
  });

export type FormValues = z.infer<typeof formSchema>;

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
  /** prefill is the pre-parsed deep-link payload (decoded by the caller). Ignored when automation is set. */
  prefill?: CreateAutomationPrefill | null;
  /** lockedEventSource fixes the trigger source and hides the source picker (e.g. the project-notifications settings section). */
  lockedEventSource?: TriggerEventSource;
  /** allowedActionTypes restricts the action-type picker; defaults to all registered action types. */
  allowedActionTypes?: ActionTypes[];
}

export const ConnectedAutomationForm = ({
  projectId,
  onSuccess,
  onCancel,
  automation,
  isEditing = false,
  prefill,
  lockedEventSource,
  allowedActionTypes,
}: AutomationFormProps) => {
  const router = useRouter();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });
  const availableActionTypes =
    allowedActionTypes ?? ActionHandlerRegistry.getAllActionTypes();

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

  // Prefill is empty when editing an existing automation; otherwise the caller-decoded payload is used directly.
  const parsedPrefill: CreateAutomationPrefill = automation
    ? {}
    : (prefill ?? {});

  // Get the action type for the form when editing
  const getActionType = (): ActionTypes =>
    (automation?.action.type as ActionTypes | undefined) ??
    parsedPrefill.actionType ??
    "WEBHOOK";

  // Get default values based on action type
  const getDefaultValues = (): FormValues => {
    const actionType = getActionType();

    const resolvedEventSource: TriggerEventSource =
      automation?.trigger.eventSource ??
      lockedEventSource ??
      parsedPrefill.eventSource ??
      TriggerEventSource.Prompt;

    const resolvedEventAction = (() => {
      if (automation) return automation.trigger.eventActions;
      if (
        resolvedEventSource === TriggerEventSource.Prompt ||
        resolvedEventSource === TriggerEventSource.Skill
      ) {
        return versionEventActionDefaults;
      }
      if (resolvedEventSource === TriggerEventSource.ProjectNotification) {
        // New channels start with every event enabled.
        return [...ProjectNotificationEventTypeSchema.options];
      }
      return [];
    })();

    const resolvedFilter: FilterState =
      automation?.trigger.filter ?? parsedPrefill.filter ?? [];

    const name = (() => {
      if (isEditing && automation) return automation.name;
      // The hidden name field needs a placeholder to pass validation.
      if (resolvedEventSource === TriggerEventSource.ProjectNotification) {
        return "Project notification";
      }
      return "";
    })();

    const baseValues = {
      name,
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
          originalUrl: webhookDefaults.webhook.originalUrl,
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
          originalUrl: githubDefaults.githubDispatch.originalUrl,
        },
      };
    } else if (actionType === "PAGERDUTY") {
      const handler = ActionHandlerRegistry.getHandler("PAGERDUTY");
      const pagerDutyDefaults = handler.getDefaultValues(automation);
      return {
        ...baseValues,
        actionType: "PAGERDUTY" as const,
        pagerDuty: pagerDutyDefaults.pagerDuty,
      };
    }
    throw new Error("Invalid action type");
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
        {
          operation: isEditing ? "automation.update" : "automation.create",
          errorOrigin: "frontend",
          errorCategory: "permission",
        },
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
        {
          operation: isEditing ? "automation.update" : "automation.create",
          errorOrigin: "frontend",
          errorCategory: "user_input",
        },
      );
      return;
    }

    const actionConfig = handler.buildActionConfig(data, data.eventSource);

    // Project-notification names are auto-generated from the destination (the
    // name field is hidden for this source; regenerated on every save so the
    // name follows destination edits).
    const resolvedName =
      data.eventSource === TriggerEventSource.ProjectNotification
        ? projectNotificationName(data)
        : data.name;

    if (isEditing && automation) {
      // Update existing automation
      await updateAutomationMutation.mutateAsync({
        projectId,
        automationId: automation.id,
        name: resolvedName,
        eventSource: data.eventSource,
        eventAction: data.eventAction,
        filter: data.filter && data.filter.length > 0 ? data.filter : null,
        status: data.status as JobConfigState,
        actionType: data.actionType,
        actionConfig: actionConfig,
      });

      showSuccessToast({
        operation: "automation.update",
        title: "Automation Updated",
        description: `Successfully updated automation "${resolvedName}".`,
      });

      onSuccess?.(automation.id);
    } else {
      // Create new automation
      const result = await createAutomationMutation.mutateAsync({
        projectId,
        name: resolvedName,
        eventSource: data.eventSource,
        eventAction: data.eventAction,
        filter: data.filter && data.filter.length > 0 ? data.filter : null,
        status: data.status as JobConfigState,
        actionType: data.actionType,
        actionConfig: actionConfig,
      });

      showSuccessToast({
        operation: "automation.create",
        title: "Automation Created",
        description: `Successfully created automation "${resolvedName}".`,
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
    isEditing && automation ? "Update automation" : "Save automation";

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
    } else if (value === "PAGERDUTY") {
      const handler = ActionHandlerRegistry.getHandler("PAGERDUTY");
      const defaultValues = handler.getDefaultValues();
      form.setValue("pagerDuty", defaultValues.pagerDuty);
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
  const watchedEventSource = form.watch("eventSource");
  const [versionOptionsOpened, setVersionOptionsOpened] = useState(false);
  const { filterOptions, isFetching } = useVersionFilterOptions({
    projectId,
    eventSource: watchedEventSource,
    enabled: versionOptionsOpened,
  });

  // Project-notification channels are deliberately minimal: match-all trigger
  // (no trigger card), auto-generated name, no status toggle.
  const isProjectNotification =
    watchedEventSource === TriggerEventSource.ProjectNotification;

  // A monitor-sourced trigger has nothing to configure, so with the source
  // locked (e.g. created from the monitor form) the card is pure noise.
  const hideTriggerCard =
    isProjectNotification ||
    (Boolean(lockedEventSource) &&
      watchedEventSource === TriggerEventSource.Monitor);

  /** handleEventSourceChange resets eventAction + filter to defaults appropriate for the picked source. */
  const handleEventSourceChange = (value: TriggerEventSource) => {
    setVersionOptionsOpened(false);
    form.setValue("eventSource", value);
    if (value === TriggerEventSource.Monitor) {
      form.setValue("eventAction", []);
    } else {
      form.setValue("eventAction", versionEventActionDefaults);
    }
    form.setValue("filter", []);
  };

  const trigger: ComponentProps<typeof AutomationForm>["trigger"] = (() => {
    if (hideTriggerCard) return null;
    const isMonitor = watchedEventSource === TriggerEventSource.Monitor;
    return {
      sourcePicker: lockedEventSource
        ? null
        : {
            showMonitor: isLangfuseCloud || isMonitor,
            onSourceChange: handleEventSourceChange,
          },
      details: isMonitor
        ? { kind: "monitor", projectId }
        : {
            kind: "version",
            eventSource: watchedEventSource,
            columns: webhookActionFilterOptions(filterOptions),
            optionsLoading: isFetching,
            onOptionsOpen: () => setVersionOptionsOpened(true),
          },
    };
  })();

  const renderForm = (
    deleteAction: ComponentProps<typeof AutomationForm>["deleteAction"],
  ) => (
    <FormProvider {...form}>
      <AutomationForm
        control={form.control}
        isEditing={isEditing}
        fieldsDisabled={!hasAccess || !isEditing}
        showNameAndStatus={isEditing && !isProjectNotification}
        autoFocusName={!automation}
        availableActionTypes={availableActionTypes}
        trigger={trigger}
        renderActionFields={({ disabled }) =>
          currentActionHandler?.renderForm({
            form,
            disabled,
            projectId,
            action: automation?.action,
          })
        }
        deleteAction={deleteAction}
        submitButtonText={submitButtonText}
        submitDisabled={!hasAccess || form.formState.isSubmitting}
        onActionTypeChange={handleActionTypeChange}
        onCancel={handleCancel}
        onSubmit={form.handleSubmit(onSubmit)}
      />
    </FormProvider>
  );

  if (
    !isEditing ||
    isProjectNotification ||
    !automation?.trigger.id ||
    !automation.action.id
  ) {
    return renderForm(null);
  }

  return (
    <DeleteAutomationDialogController
      projectId={projectId}
      automationId={automation.id}
      onSuccess={() => {
        router.push(`/project/${projectId}/settings/automations`);
      }}
    >
      {({ disabled, openDialog }) =>
        renderForm({ disabled: disabled !== undefined, onDelete: openDialog })
      }
    </DeleteAutomationDialogController>
  );
};
