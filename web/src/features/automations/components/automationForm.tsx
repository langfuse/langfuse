import React from "react";
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
import { Switch } from "@/src/components/design-system/Switch/Switch";
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
  ProjectNotificationEventTypeSchema,
  TriggerEventSource,
  TriggerEventSourceSchema,
  webhookActionFilterOptions,
} from "@langfuse/shared";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { DeleteAutomationDialogController } from "./DeleteAutomationDialogController";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { ActionHandlerRegistry } from "./actions";
import { createWebhookSchema } from "./actions/WebhookActionForm";
import { type ActionValidationError } from "./actions/BaseActionHandler";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import Link from "next/link";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

type AutomationValidationMessages = {
  nameRequired: string;
  nameTooLong: string;
  eventSourceRequired: string;
  eventActionRequired: string;
  channelRequired: string;
  channelNameRequired: string;
  invalidUrl: string;
  eventTypeRequired: string;
  eventTypeTooLong: string;
  protectedHeader: string;
};

/** promptEventActionDefaults is the default eventAction set for a fresh prompt-source automation. */
const promptEventActionDefaults: string[] = ["created", "updated", "deleted"];

/** projectNotificationName derives the auto-generated channel name from the destination — the name field is hidden for this source. */
const projectNotificationName = (
  data: FormValues,
  fallbackName: string,
): string => {
  if (data.actionType === "SLACK") return `Slack #${data.slack.channelName}`;
  if (data.actionType === "WEBHOOK") {
    try {
      return `Webhook ${new URL(data.webhook.url).hostname}`;
    } catch {
      return "Webhook";
    }
  }
  return fallbackName;
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

/** serializeCreateAutomationPrefill encodes a typed prefill as a base64url JSON blob for a single URL query param, UTF-8-safe so non-ASCII tags don't throw at btoa. */
const serializeCreateAutomationPrefill = (
  prefill: CreateAutomationPrefill,
): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(prefill));
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

/** automationCreateHref builds the deep-link to the automations create form, prefilling eventSource as Monitor and (optionally) the chosen actionType + a same-origin redirectUrl to return to after save. */
export const automationCreateHref = (
  projectId: string,
  actionType?: ActionTypes,
  redirectUrl?: string,
): string => {
  const prefill = serializeCreateAutomationPrefill({
    eventSource: TriggerEventSource.Monitor,
    ...(actionType ? { actionType } : {}),
    ...(redirectUrl ? { redirectUrl } : {}),
  });
  const params = new URLSearchParams({ view: "create", prefill });
  return `/project/${projectId}/automations?${params.toString()}`;
};

const createFormSchema = (messages: AutomationValidationMessages) => {
  const slackSchema = z.object({
    channelId: z.string().min(1, messages.channelRequired),
    channelName: z.string().min(1, messages.channelNameRequired),
    messageTemplate: z.string().optional(),
  });

  const githubDispatchSchema = z.object({
    url: z.url(messages.invalidUrl),
    eventType: z
      .string()
      .min(1, messages.eventTypeRequired)
      .max(100, messages.eventTypeTooLong),
    githubToken: z.string(),
    displayGitHubToken: z.string().optional(),
    originalUrl: z.string().optional(),
  });

  const baseFormSchema = z.object({
    name: z
      .string()
      .min(1, messages.nameRequired)
      .max(100, messages.nameTooLong),
    eventSource: z.string().min(1, messages.eventSourceRequired),
    eventAction: z.array(z.string()),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    filter: z.array(z.any()).optional(),
  });

  return z
    .discriminatedUnion("actionType", [
      baseFormSchema.extend({
        actionType: z.literal("WEBHOOK"),
        webhook: createWebhookSchema({
          invalidUrl: messages.invalidUrl,
          protectedHeader: messages.protectedHeader,
        }),
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
      if (
        data.eventSource === TriggerEventSource.Prompt &&
        data.eventAction.length === 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["eventAction"],
          message: messages.eventActionRequired,
        });
      }
    });
};

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

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
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const t = useTranslations("remainderUi.automations");
  return (
    <FormField
      control={control}
      name="eventSource"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("form.eventSource")}</FormLabel>
          <Select
            onValueChange={(value) =>
              onSourceChange(value as TriggerEventSource)
            }
            value={field.value}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={t("form.eventSourcePlaceholder")} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={TriggerEventSource.Prompt}>
                {t("eventSources.prompt")}
              </SelectItem>
              {(isLangfuseCloud ||
                field.value === TriggerEventSource.Monitor) && (
                <SelectItem value={TriggerEventSource.Monitor}>
                  {t("eventSources.alert")}
                </SelectItem>
              )}
              <SelectItem disabled={true} value="planned">
                {t("form.moreComingSoon")}
              </SelectItem>
            </SelectContent>
          </Select>
          <FormDescription>{t("form.eventSourceDescription")}</FormDescription>
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
}) => {
  const t = useTranslations("remainderUi.automations.form");

  return (
    <>
      <FormField
        control={control}
        name="eventAction"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("eventAction")}</FormLabel>
            <FormControl>
              <MultiSelect
                title={t("eventActions")}
                label={t("actions")}
                values={field.value}
                onValueChange={field.onChange}
                options={[
                  {
                    value: "created",
                    description: t("createdDescription"),
                  },
                  {
                    value: "updated",
                    description: t("updatedDescription"),
                  },
                  {
                    value: "deleted",
                    description: t("deletedDescription"),
                  },
                ]}
                className="my-0 w-auto overflow-hidden"
                disabled={disabled}
                labelTruncateCutOff={4}
              />
            </FormControl>
            <FormDescription>{t("eventActionDescription")}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="filter"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("filter")}</FormLabel>
            <FormControl>
              <InlineFilterBuilder
                columns={webhookActionFilterOptions()}
                filterState={field.value || []}
                onChange={field.onChange}
                disabled={disabled}
              />
            </FormControl>
            <FormDescription>{t("filterDescription")}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};

/** MonitorTriggerFields renders an info card explaining that monitors connect to this automation via the create-monitor page. */
const MonitorTriggerFields = ({ projectId }: { projectId: string }) => {
  const t = useTranslations("remainderUi.automations.form");

  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>{t("alertsConnectTitle")}</AlertTitle>
      <AlertDescription>
        {t("alertsConnectPrefix")}{" "}
        <Link
          href={`/project/${projectId}/alerts/new`}
          className="text-primary underline underline-offset-2"
        >
          {t("alertsConnectLink")}
        </Link>
        .
      </AlertDescription>
    </Alert>
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
  /** prefill is the pre-parsed deep-link payload (decoded by the caller). Ignored when automation is set. */
  prefill?: CreateAutomationPrefill | null;
  /** lockedEventSource fixes the trigger source and hides the source picker (e.g. the project-notifications settings section). */
  lockedEventSource?: TriggerEventSource;
  /** allowedActionTypes restricts the action-type picker; defaults to all registered action types. */
  allowedActionTypes?: ActionTypes[];
}

export const AutomationForm = ({
  projectId,
  onSuccess,
  onCancel,
  automation,
  isEditing = false,
  prefill,
  lockedEventSource,
  allowedActionTypes,
}: AutomationFormProps) => {
  const t = useTranslations("remainderUi.automations");
  const router = useRouter();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  const utils = api.useUtils();

  const formSchema = createFormSchema({
    nameRequired: t("validation.nameRequired"),
    nameTooLong: t("validation.nameTooLong"),
    eventSourceRequired: t("validation.eventSourceRequired"),
    eventActionRequired: t("validation.eventActionRequired"),
    channelRequired: t("validation.channelRequired"),
    channelNameRequired: t("validation.channelNameRequired"),
    invalidUrl: t("validation.invalidUrl"),
    eventTypeRequired: t("validation.eventTypeRequired"),
    eventTypeTooLong: t("validation.eventTypeTooLong"),
    protectedHeader: t("validation.protectedHeaderShort"),
  });

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

    const resolvedEventAction: string[] =
      automation?.trigger.eventActions ??
      (resolvedEventSource === TriggerEventSource.Prompt
        ? promptEventActionDefaults
        : resolvedEventSource === TriggerEventSource.ProjectNotification
          ? // New channels start with every event enabled; the per-event
            // toggles in the settings section manage them afterwards.
            [...ProjectNotificationEventTypeSchema.options]
          : []);

    const resolvedFilter: FilterState =
      automation?.trigger.filter ?? parsedPrefill.filter ?? [];

    const baseValues = {
      // Project-notification names are auto-generated at submit; seed a
      // non-empty placeholder so the hidden field passes validation.
      name:
        isEditing && automation
          ? automation.name
          : resolvedEventSource === TriggerEventSource.ProjectNotification
            ? t("form.projectNotificationName")
            : "",
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
        t("form.permissionDenied"),
        t("form.permissionDescription"),
      );
      return;
    }

    // Use action handler to validate and build config
    const handler = ActionHandlerRegistry.getHandler(data.actionType);
    const validation = handler.validateFormData(data);

    const formatValidationError = (error: ActionValidationError): string => {
      switch (error.code) {
        case "webhookUrlRequired":
        case "duplicateHeaderNames":
        case "slackChannelRequired":
        case "channelNameRequired":
        case "githubDispatchUrlRequired":
        case "eventTypeRequired":
        case "eventTypeTooLong":
        case "githubTokenRequiredForUrlChange":
        case "githubTokenRequired":
          return t(`validation.${error.code}`);
        case "headerNameEmpty":
        case "headerValueEmpty":
          return t(`validation.${error.code}`, { index: error.index });
        case "headerVisibilityValueRequired":
          return t("validation.headerVisibilityValueRequired", {
            index: error.index,
            visibility: t(
              error.visibility === "public"
                ? "validation.visibilityPublic"
                : "validation.visibilitySecret",
            ),
          });
        case "protectedHeader":
          return t("validation.protectedHeader", {
            index: error.index,
            name: error.name,
          });
      }
    };

    if (!validation.isValid) {
      showErrorToast(
        t("form.validationError"),
        validation.errors?.map(formatValidationError).join(", ") ||
          t("form.validationFallback"),
      );
      return;
    }

    const actionConfig = handler.buildActionConfig(
      data,
      data.eventSource as TriggerEventSource,
    );

    // Project-notification names are auto-generated from the destination (the
    // name field is hidden for this source; regenerated on every save so the
    // name follows destination edits).
    const resolvedName =
      data.eventSource === TriggerEventSource.ProjectNotification
        ? projectNotificationName(data, t("form.projectNotificationName"))
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
        title: t("form.updatedTitle"),
        description: t("form.updatedSuccess", { name: resolvedName }),
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
        title: t("form.createdTitle"),
        description: t("form.createdSuccess", { name: resolvedName }),
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
    isEditing && automation ? t("form.update") : t("form.save");

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
        {isEditing && !isProjectNotification && (
          <div className="mb-6 flex items-center gap-4">
            <div className="flex-1">
              <FormField
                control={form.control}
                name="name"
                rules={{ required: t("validation.nameRequired") }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder={t("form.namePlaceholder")}
                        {...field}
                        autoFocus={!automation}
                        disabled={!hasAccess || !isEditing}
                        className="border-border rounded-none border-0 border-b bg-transparent px-0 text-2xl font-bold focus-visible:ring-0 focus-visible:ring-offset-0"
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
                  <FormLabel className="text-sm font-bold">
                    {t("form.active")}
                  </FormLabel>
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

        {!hideTriggerCard && (
          <Card>
            <CardHeader>
              <CardTitle>{t("form.trigger")}</CardTitle>
              <CardDescription>{t("form.triggerDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!lockedEventSource && (
                <EventSourceField
                  control={form.control}
                  onSourceChange={handleEventSourceChange}
                  disabled={!hasAccess || !isEditing}
                />
              )}
              {watchedEventSource === TriggerEventSource.Monitor ? (
                <MonitorTriggerFields projectId={projectId} />
              ) : (
                <PromptTriggerFields
                  control={form.control}
                  disabled={!hasAccess || !isEditing}
                />
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("form.action")}</CardTitle>
            <CardDescription>{t("form.actionDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="actionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.actionType")}</FormLabel>
                  <Select
                    onValueChange={handleActionTypeChange}
                    value={field.value}
                    disabled={!hasAccess || !isEditing}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("form.actionTypePlaceholder")}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(
                        allowedActionTypes ??
                        ActionHandlerRegistry.getAllActionTypes()
                      ).map((actionType) => (
                        <SelectItem key={actionType} value={actionType}>
                          {actionType === "WEBHOOK"
                            ? t("actionTypes.webhook")
                            : actionType === "SLACK"
                              ? t("actionTypes.slack")
                              : actionType === "GITHUB_DISPATCH"
                                ? t("actionTypes.githubDispatch")
                                : t("actionTypes.annotationQueue")}
                        </SelectItem>
                      ))}
                      <SelectItem disabled={true} value="planned">
                        {t("form.moreComingSoon")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t("form.actionTypeDescription")}
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
            {/* Project-notification channels are deleted from the channel list; the in-form delete redirects to the automations page. */}
            {isEditing &&
              !isProjectNotification &&
              automation?.trigger.id &&
              automation?.action.id && (
                <div>
                  <DeleteAutomationDialogController
                    projectId={projectId}
                    automationId={automation.id}
                    onSuccess={() => {
                      router.push(`/project/${projectId}/settings/automations`);
                    }}
                  >
                    {({ disabled, openDialog }) => (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-light-red flex items-center"
                        disabled={disabled !== undefined}
                        onClick={openDialog}
                      >
                        <span className="text-dark-red">{t("delete")}</span>
                      </Button>
                    )}
                  </DeleteAutomationDialogController>
                </div>
              )}
            <div className="grow"></div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleCancel}>
                {t("cancel")}
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
