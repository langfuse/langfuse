/* eslint-disable no-nested-ternary */
import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
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
import { InlineFilterBuilder, MultiSelect } from "@/src/features/filters";
import { DeleteAutomationDialogController } from "./DeleteAutomationDialogController";
import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { useHasProjectAccess } from "@/src/features/rbac";
import { ActionHandlerRegistry } from "./actions";
import { webhookSchema } from "./actions/WebhookActionForm";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import Link from "next/link";
import { Info } from "lucide-react";

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

const scoreTriggerSchema = z.object({
  key: z.string(),
  name: z.string(),
  dataType: z.enum(["NUMERIC", "BOOLEAN", "CATEGORICAL", "TEXT"]),
  condition: z.enum(["any", "equals", "oneOf", "between"]),
  value: z.string(),
  values: z.array(z.string()),
  minValue: z.string(),
  maxValue: z.string(),
});

const annotationQueueSchema = z.object({
  queueIds: z.array(z.string()).min(1, "Select at least one annotation queue"),
});

/** promptEventActionDefaults is the default eventAction set for a fresh prompt-source automation. */
const promptEventActionDefaults: string[] = ["created", "updated", "deleted"];

/** projectNotificationName derives the auto-generated channel name from the destination — the name field is hidden for this source. */
const projectNotificationName = (data: FormValues): string => {
  if (data.actionType === "SLACK") return `Slack #${data.slack.channelName}`;
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

// Define schemas for form validation
const baseFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  eventSource: TriggerEventSourceSchema,
  eventAction: z.array(z.string()),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  filter: z.array(z.any()).optional(),
  score: scoreTriggerSchema,
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
      actionType: z.literal("ANNOTATION_QUEUE"),
      annotationQueue: annotationQueueSchema,
    }),
  ])
  .superRefine((data, ctx) => {
    // Prompt-source triggers require at least one event action; monitor and
    // project-notification sources don't use this field (project-notification
    // triggers are match-all).
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
    if (
      data.eventSource === TriggerEventSource.Score &&
      (!data.score.name || !data.score.dataType)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["score"],
        message: "Select a score.",
      });
    }
    if (
      data.eventSource === TriggerEventSource.Score &&
      data.score.condition === "equals" &&
      data.score.value === ""
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["score", "value"],
        message: "Enter a score value.",
      });
    }
    if (
      data.eventSource === TriggerEventSource.Score &&
      data.score.condition === "oneOf" &&
      data.score.values.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["score", "values"],
        message: "Select at least one score value.",
      });
    }
    if (
      data.eventSource === TriggerEventSource.Score &&
      data.score.condition === "between"
    ) {
      const min = Number(data.score.minValue);
      const max = Number(data.score.maxValue);
      if (
        data.score.minValue === "" ||
        data.score.maxValue === "" ||
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        min > max
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["score", "minValue"],
          message:
            "Enter a valid score range whose minimum is not greater than its maximum.",
        });
      }
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
  const { isLangfuseCloud } = useLangfuseCloudRegion();
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
              <SelectItem value={TriggerEventSource.Score}>Score</SelectItem>
              {(isLangfuseCloud ||
                field.value === TriggerEventSource.Monitor) && (
                <SelectItem value={TriggerEventSource.Monitor}>
                  Alert
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
  projectId,
  control,
  disabled,
}: {
  projectId: string;
  control: Control<FormValues>;
  disabled: boolean;
}) => {
  const [optionsOpened, setOptionsOpened] = React.useState(false);
  const { data: filterOptions, isFetching: optionsLoading } =
    api.prompts.filterOptions.useQuery(
      { projectId },
      { enabled: optionsOpened },
    );

  return (
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
                columns={webhookActionFilterOptions(filterOptions)}
                columnsWithCustomSelect={["labels", "tags"]}
                loadingOptionColumns={optionsLoading ? ["labels", "tags"] : []}
                onOptionsOpen={(columnId) => {
                  if (columnId === "labels" || columnId === "tags") {
                    setOptionsOpened(true);
                  }
                }}
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
};

/** MonitorTriggerFields renders an info card explaining that monitors connect to this automation via the create-monitor page. */
const MonitorTriggerFields = ({ projectId }: { projectId: string }) => (
  <Alert icon={Info}>
    <Alert.Title>How Alerts Connect</Alert.Title>
    <Alert.Description>
      Add this automation to an alert from the{" "}
      <Link
        href={`/project/${projectId}/alerts/new`}
        className="text-primary underline underline-offset-2"
      >
        create alerts page
      </Link>
      .
    </Alert.Description>
  </Alert>
);

const scoreKey = (name: string, dataType: string) =>
  JSON.stringify([name, dataType]);

const getScoreTriggerDefaults = (
  filter: FilterState,
): z.infer<typeof scoreTriggerSchema> => {
  const name = filter.find((item) => item.column === "name")?.value;
  const dataType = filter.find((item) => item.column === "dataType")?.value;
  const valueFilters = filter.filter((item) =>
    ["value", "stringValue", "longStringValue"].includes(item.column),
  );
  const valueFilter = valueFilters[0];
  const validName = typeof name === "string" ? name : "";
  const validDataType =
    dataType === "NUMERIC" ||
    dataType === "BOOLEAN" ||
    dataType === "CATEGORICAL" ||
    dataType === "TEXT"
      ? dataType
      : "NUMERIC";
  const isRange =
    validDataType === "NUMERIC" &&
    valueFilters.length === 2 &&
    valueFilters.some((item) => item.operator === ">=") &&
    valueFilters.some((item) => item.operator === "<=");
  const isMultiValue =
    valueFilter?.type === "stringOptions" &&
    valueFilter.operator === "any of" &&
    Array.isArray(valueFilter.value);
  const legacyMultiValue =
    Boolean(valueFilter) &&
    (validDataType === "BOOLEAN" || validDataType === "CATEGORICAL");
  const minValue = valueFilters.find((item) => item.operator === ">=")?.value;
  const maxValue = valueFilters.find((item) => item.operator === "<=")?.value;

  return {
    key: validName ? scoreKey(validName, validDataType) : "",
    name: validName,
    dataType: validDataType as z.infer<typeof scoreTriggerSchema>["dataType"],
    condition: isRange
      ? "between"
      : isMultiValue || legacyMultiValue
        ? "oneOf"
        : valueFilter
          ? "equals"
          : "any",
    value:
      typeof valueFilter?.value === "string" ||
      typeof valueFilter?.value === "number"
        ? String(valueFilter.value)
        : "",
    values: isMultiValue
      ? valueFilter.value
      : legacyMultiValue &&
          (typeof valueFilter?.value === "string" ||
            typeof valueFilter?.value === "number")
        ? [String(valueFilter.value)]
        : [],
    minValue:
      typeof minValue === "string" || typeof minValue === "number"
        ? String(minValue)
        : "",
    maxValue:
      typeof maxValue === "string" || typeof maxValue === "number"
        ? String(maxValue)
        : "",
  };
};

const buildScoreTriggerFilter = (
  score: z.infer<typeof scoreTriggerSchema>,
): FilterState => {
  const filter: FilterState = [
    { column: "name", type: "string", operator: "=", value: score.name },
    {
      column: "dataType",
      type: "string",
      operator: "=",
      value: score.dataType,
    },
  ];
  if (score.condition === "any") return filter;

  if (score.condition === "between") {
    filter.push(
      {
        column: "value",
        type: "number",
        operator: ">=",
        value: Number(score.minValue),
      },
      {
        column: "value",
        type: "number",
        operator: "<=",
        value: Number(score.maxValue),
      },
    );
  } else if (score.condition === "oneOf") {
    filter.push({
      column: score.dataType === "CATEGORICAL" ? "stringValue" : "value",
      type: "stringOptions",
      operator: "any of",
      value: score.values,
    });
  } else if (score.dataType === "NUMERIC" || score.dataType === "BOOLEAN") {
    filter.push({
      column: "value",
      type: "number",
      operator: "=",
      value: Number(score.value),
    });
  } else {
    filter.push({
      column: "stringValue",
      type: "string",
      operator: "=",
      value: score.value,
    });
  }
  return filter;
};

const ScoreTriggerFields = ({
  projectId,
  control,
  disabled,
}: {
  projectId: string;
  control: Control<FormValues>;
  disabled: boolean;
}) => {
  const { data, isLoading } = api.scoreConfigs.all.useQuery({ projectId });

  return (
    <>
      <FormField
        control={control}
        name="score"
        render={({ field }) => {
          const config = data?.configs.find(
            (item) =>
              item.name === field.value.name &&
              item.dataType === field.value.dataType,
          );
          const configs = (data?.configs ?? []).filter(
            (item) => !item.isArchived || item.id === config?.id,
          );

          return (
            <FormItem>
              <FormLabel>Score condition</FormLabel>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>When score</span>
                <Select
                  value={field.value.key}
                  disabled={disabled || isLoading}
                  onValueChange={(key) => {
                    const selected = configs.find(
                      (item) => scoreKey(item.name, item.dataType) === key,
                    );
                    if (!selected) return;
                    field.onChange({
                      key,
                      name: selected.name,
                      dataType: selected.dataType,
                      condition: "any",
                      value: "",
                      values: [],
                      minValue: "",
                      maxValue: "",
                    });
                  }}
                >
                  <FormControl>
                    <SelectTrigger
                      aria-label="Score name"
                      className="w-fit max-w-full"
                      disableValueLineClamp
                    >
                      <SelectValue placeholder="Select a score" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {configs.map((item) => (
                      <SelectItem
                        key={item.id}
                        value={scoreKey(item.name, item.dataType)}
                      >
                        {item.name} ({item.dataType.toLowerCase()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {config ? (
                  <>
                    <Select
                      value={field.value.condition}
                      onValueChange={(condition) =>
                        field.onChange({
                          ...field.value,
                          condition,
                          value: "",
                          values: [],
                          minValue: "",
                          maxValue: "",
                        })
                      }
                      disabled={disabled}
                    >
                      <FormControl>
                        <SelectTrigger
                          aria-label="Score value condition"
                          className="w-fit"
                          disableValueLineClamp
                        >
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="any">has any value</SelectItem>
                        {config.dataType === "BOOLEAN" ||
                        config.dataType === "CATEGORICAL" ? (
                          <SelectItem value="oneOf">is one of</SelectItem>
                        ) : (
                          <SelectItem value="equals">equals</SelectItem>
                        )}
                        {config.dataType === "NUMERIC" ? (
                          <SelectItem value="between">in between</SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                    {field.value.condition === "oneOf" ? (
                      <MultiSelect
                        title="Select score values"
                        label="Select score values"
                        values={field.value.values}
                        onValueChange={(values) =>
                          field.onChange({ ...field.value, values })
                        }
                        options={(config.categories ?? []).map((category) => ({
                          value:
                            config.dataType === "BOOLEAN"
                              ? String(category.value)
                              : category.label,
                          displayValue: category.label,
                        }))}
                        className="my-0 w-fit max-w-full"
                        disabled={disabled}
                        labelTruncateCutOff={2}
                      />
                    ) : field.value.condition === "between" ? (
                      <>
                        <Input
                          type="number"
                          value={field.value.minValue}
                          onChange={(event) =>
                            field.onChange({
                              ...field.value,
                              minValue: event.target.value,
                            })
                          }
                          disabled={disabled}
                          placeholder="Minimum"
                          aria-label="Minimum score value"
                          className="h-8 w-28"
                        />
                        <span>and</span>
                        <Input
                          type="number"
                          value={field.value.maxValue}
                          onChange={(event) =>
                            field.onChange({
                              ...field.value,
                              maxValue: event.target.value,
                            })
                          }
                          disabled={disabled}
                          placeholder="Maximum"
                          aria-label="Maximum score value"
                          className="h-8 w-28"
                        />
                      </>
                    ) : field.value.condition === "equals" ? (
                      <Input
                        type={config.dataType === "NUMERIC" ? "number" : "text"}
                        value={field.value.value}
                        onChange={(event) =>
                          field.onChange({
                            ...field.value,
                            value: event.target.value,
                          })
                        }
                        disabled={disabled}
                        placeholder="Value"
                        aria-label="Score value"
                        className="h-8 w-40"
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
              <FormDescription>
                Choose the score values that should trigger this automation.
                Only scores attached to observations can add items to annotation
                queues.
              </FormDescription>
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </>
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
        : resolvedEventSource === TriggerEventSource.Score
          ? ["created", "updated"]
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
            ? "Project notification"
            : "",
      eventSource: resolvedEventSource,
      eventAction: resolvedEventAction,
      status: (isEditing && automation
        ? automation.trigger.status
        : "ACTIVE") as "ACTIVE" | "INACTIVE",
      filter: resolvedFilter,
      score: getScoreTriggerDefaults(resolvedFilter),
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
    } else if (actionType === "ANNOTATION_QUEUE") {
      const handler = ActionHandlerRegistry.getHandler("ANNOTATION_QUEUE");
      const defaults = handler.getDefaultValues(automation);
      return {
        ...baseValues,
        actionType: "ANNOTATION_QUEUE" as const,
        annotationQueue: {
          queueIds: defaults.annotationQueue.queueIds ?? [],
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

    const actionConfig = handler.buildActionConfig(
      data,
      data.eventSource as TriggerEventSource,
    );

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
        filter:
          data.eventSource === TriggerEventSource.Score
            ? buildScoreTriggerFilter(data.score)
            : data.filter && data.filter.length > 0
              ? data.filter
              : null,
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
        filter:
          data.eventSource === TriggerEventSource.Score
            ? buildScoreTriggerFilter(data.score)
            : data.filter && data.filter.length > 0
              ? data.filter
              : null,
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
    } else if (value === "ANNOTATION_QUEUE") {
      const handler = ActionHandlerRegistry.getHandler("ANNOTATION_QUEUE");
      const defaultValues = handler.getDefaultValues();
      form.setValue("annotationQueue", defaultValues.annotationQueue);
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
    if (value === TriggerEventSource.Score) {
      form.setValue("eventAction", ["created", "updated"]);
      handleActionTypeChange("ANNOTATION_QUEUE");
    } else if (value === TriggerEventSource.Monitor) {
      form.setValue("eventAction", []);
      if (form.getValues("actionType") === "ANNOTATION_QUEUE") {
        handleActionTypeChange("WEBHOOK");
      }
    } else {
      form.setValue("eventAction", promptEventActionDefaults);
      if (form.getValues("actionType") === "ANNOTATION_QUEUE") {
        handleActionTypeChange("WEBHOOK");
      }
    }
    form.setValue("filter", []);
  };

  const actionTypes =
    allowedActionTypes ?? ActionHandlerRegistry.getAllActionTypes();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-6">
        {isEditing && !isProjectNotification && (
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
                  <FormLabel className="text-sm font-bold">Active</FormLabel>
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
              <CardTitle>Trigger</CardTitle>
              <CardDescription>
                Configure when this automation should run.
              </CardDescription>
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
              ) : watchedEventSource === TriggerEventSource.Score ? (
                <ScoreTriggerFields
                  projectId={projectId}
                  control={form.control}
                  disabled={!hasAccess || !isEditing}
                />
              ) : (
                <PromptTriggerFields
                  projectId={projectId}
                  control={form.control}
                  disabled={!hasAccess || !isEditing}
                />
              )}
            </CardContent>
          </Card>
        )}

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
                      {actionTypes.map((actionType) => (
                        <SelectItem
                          key={actionType}
                          value={actionType}
                          disabled={
                            watchedEventSource === TriggerEventSource.Score
                              ? actionType !== "ANNOTATION_QUEUE"
                              : actionType === "ANNOTATION_QUEUE"
                          }
                        >
                          {actionType === "WEBHOOK"
                            ? "Webhook"
                            : actionType === "SLACK"
                              ? "Slack"
                              : actionType === "GITHUB_DISPATCH"
                                ? "GitHub Dispatch"
                                : "Annotation Queue"}
                        </SelectItem>
                      ))}
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
                        <span className="text-dark-red">Delete</span>
                      </Button>
                    )}
                  </DeleteAutomationDialogController>
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
