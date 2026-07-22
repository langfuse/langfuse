import type { AgUiRunAgentInput } from "@/src/ee/features/in-app-agent/schema";
import {
  isInAppAgentQuickActionContext,
  type InAppAgentQuickActionAttribution,
} from "@/src/ee/features/in-app-agent/quickActions";
import { getInAppAgentProjectRoute } from "@/src/ee/features/in-app-agent/routeContext";

type InAppAgentContext = AgUiRunAgentInput["context"];

export type InAppAgentScreenContextDescription =
  | { type: "page" }
  | { type: "observation" }
  | { type: "trace" }
  | {
      type: "prompt";
      name: string;
      selector?:
        | { type: "version"; value: string }
        | { type: "label"; value: string };
    }
  | { type: "session"; id: string }
  | { type: "dataset" }
  | { type: "datasetItem" }
  | { type: "experimentRun" }
  | { type: "trace-list"; hasAppliedFilters: boolean }
  | { type: "observations-list"; hasAppliedFilters: boolean }
  | { type: "sessions-list"; hasAppliedFilters: boolean }
  | { type: "prompts-list"; hasAppliedFilters: boolean }
  | { type: "datasets-list"; hasAppliedFilters: boolean };

const CURRENT_URL_CONTEXT_DESCRIPTION = "current_url";
const QUICK_ACTION_KEY_CONTEXT_DESCRIPTION = "quick_action_key";
const QUICK_ACTION_CATEGORY_CONTEXT_DESCRIPTION = "quick_action_category";
const MESSAGE_ENTRY_POINT_CONTEXT_DESCRIPTION = "message_entry_point";
const MAX_SCREEN_CONTEXT_SEARCH_PARAMS = 30;
const MAX_CONTEXT_KEY_LENGTH = 80;
const MAX_CONTEXT_VALUE_LENGTH = 500;
const MAX_SCREEN_CONTEXT_PATH_LENGTH = 500;
const MAX_SCREEN_CONTEXT_HASH_LENGTH = 200;
const MAX_SCREEN_CONTEXT_JSON_LENGTH = 4_000;
const MAX_QUICK_ACTION_KEY_LENGTH = 80;
const QUICK_ACTION_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const USER_CONTEXT_DESCRIPTIONS = new Set([
  "user_name",
  "current_timezone",
  "browser_languages",
]);

// Entity-granular classifier of a project URL, used for the screen-context
// banner and focused quick actions. getInAppAgentQuickActionContext() in
// quickActions.ts classifies the same URL coarsely by section for the picker.
export function getInAppAgentScreenContextDescription(
  currentUrl: string,
): InAppAgentScreenContextDescription {
  const projectRoute = getInAppAgentProjectRoute(currentUrl);

  if (!projectRoute) {
    return { type: "page" };
  }

  const { parsedUrl, routeSegments } = projectRoute;

  const section = routeSegments[0];
  const detailId = routeSegments[1];
  const peekId = parsedUrl.searchParams.get("peek");
  const observationId = parsedUrl.searchParams.get("observation");
  const hasAppliedFilters = ["filter", "search"].some((parameter) =>
    Boolean(parsedUrl.searchParams.get(parameter)?.trim()),
  );

  if (
    (section === "traces" && observationId && (detailId || peekId)) ||
    (section === "observations" && peekId)
  ) {
    return { type: "observation" };
  }

  if (section === "traces" && ((detailId && detailId !== "setup") || peekId)) {
    return { type: "trace" };
  }

  if (section === "traces" && !detailId) {
    return { type: "trace-list", hasAppliedFilters };
  }

  if (section === "observations" && !detailId) {
    return { type: "observations-list", hasAppliedFilters };
  }

  if (section === "prompts") {
    const promptPathSegments = routeSegments.slice(1);
    const isMetricsPage =
      promptPathSegments[promptPathSegments.length - 1] === "metrics";
    const promptName = (
      isMetricsPage ? promptPathSegments.slice(0, -1) : promptPathSegments
    ).join("/");
    const legacyPromptName = parsedUrl.searchParams.get("promptName");
    const resolvedPromptName =
      promptName === "prompt-detail" ? legacyPromptName : promptName;

    if (resolvedPromptName && resolvedPromptName !== "new") {
      const version = parsedUrl.searchParams.get("version");
      const label = parsedUrl.searchParams.get("label");

      if (version && /^\d+$/.test(version)) {
        return {
          type: "prompt",
          name: resolvedPromptName,
          selector: { type: "version", value: version },
        };
      }

      if (label) {
        return {
          type: "prompt",
          name: resolvedPromptName,
          selector: { type: "label", value: label },
        };
      }

      return { type: "prompt", name: resolvedPromptName };
    }

    if (promptPathSegments.length === 0) {
      return { type: "prompts-list", hasAppliedFilters };
    }
  }

  if (section === "sessions" && detailId) {
    return { type: "session", id: detailId };
  }

  if (section === "sessions" && !detailId) {
    return { type: "sessions-list", hasAppliedFilters };
  }

  if (section === "datasets" && detailId) {
    if (routeSegments[2] === "runs" && routeSegments[3]) {
      return { type: "experimentRun" };
    }

    if (routeSegments[2] === "items" && routeSegments[3]) {
      return { type: "datasetItem" };
    }

    return { type: "dataset" };
  }

  if (section === "datasets" && !detailId) {
    return { type: "datasets-list", hasAppliedFilters };
  }

  return { type: "page" };
}

export function createInAppAgentScreenContext(params: {
  currentUrl: string;
}): InAppAgentContext {
  return [
    {
      description: "current_url",
      value: params.currentUrl,
    },
  ];
}

export function sanitizeInAppAgentContext(
  context: InAppAgentContext,
  projectId: string,
): InAppAgentContext {
  const sanitizedContext: InAppAgentContext = [];
  const currentUrlContext = context.find(
    (item) => item.description === CURRENT_URL_CONTEXT_DESCRIPTION,
  );

  if (currentUrlContext) {
    const currentUrl = sanitizeCurrentUrlContext(
      currentUrlContext.value,
      projectId,
    );
    const serializedCurrentUrl = currentUrl
      ? JSON.stringify(currentUrl)
      : undefined;

    if (
      serializedCurrentUrl &&
      serializedCurrentUrl.length <= MAX_SCREEN_CONTEXT_JSON_LENGTH
    ) {
      sanitizedContext.push({
        description: CURRENT_URL_CONTEXT_DESCRIPTION,
        value: serializedCurrentUrl,
      });
    }
  }

  sanitizedContext.push(...sanitizeUserContext(context));

  return sanitizedContext;
}

export function createInAppAgentQuickActionAttributionContext(
  attribution: InAppAgentQuickActionAttribution,
): InAppAgentContext {
  return [
    {
      description: QUICK_ACTION_KEY_CONTEXT_DESCRIPTION,
      value: attribution.key,
    },
    {
      description: QUICK_ACTION_CATEGORY_CONTEXT_DESCRIPTION,
      value: attribution.category,
    },
  ];
}

// Attribution is telemetry only: it is validated by shape here and read for
// trace metadata, but never forwarded into the model-visible sanitized context.
export function getInAppAgentQuickActionAttribution(
  context: InAppAgentContext,
): InAppAgentQuickActionAttribution | undefined {
  const quickActionKey = context
    .find((item) => item.description === QUICK_ACTION_KEY_CONTEXT_DESCRIPTION)
    ?.value.trim();
  const quickActionCategory = context
    .find(
      (item) => item.description === QUICK_ACTION_CATEGORY_CONTEXT_DESCRIPTION,
    )
    ?.value.trim();

  if (
    !quickActionKey ||
    quickActionKey.length > MAX_QUICK_ACTION_KEY_LENGTH ||
    !QUICK_ACTION_KEY_PATTERN.test(quickActionKey) ||
    !quickActionCategory ||
    !isInAppAgentQuickActionContext(quickActionCategory)
  ) {
    return undefined;
  }

  return { key: quickActionKey, category: quickActionCategory };
}

export function getInAppAgentQuickActionTraceMetadata(
  context: InAppAgentContext,
): Record<string, string> {
  const attribution = getInAppAgentQuickActionAttribution(context);

  return attribution
    ? {
        quick_action_key: attribution.key,
        quick_action_category: attribution.category,
      }
    : {};
}

export const IN_APP_AGENT_MESSAGE_ENTRY_POINTS = [
  "chat",
  "add-widget-modal",
] as const;

export type InAppAgentMessageEntryPoint =
  (typeof IN_APP_AGENT_MESSAGE_ENTRY_POINTS)[number];

export function createInAppAgentMessageEntryPointContext(
  entryPoint: InAppAgentMessageEntryPoint,
): InAppAgentContext {
  return [
    {
      description: MESSAGE_ENTRY_POINT_CONTEXT_DESCRIPTION,
      value: entryPoint,
    },
  ];
}

// Telemetry only, like quick-action attribution: read for trace metadata but
// never forwarded into the model-visible sanitized context.
export function getInAppAgentMessageEntryPointTraceMetadata(
  context: InAppAgentContext,
): Record<string, string> {
  const entryPoint = context
    .find(
      (item) => item.description === MESSAGE_ENTRY_POINT_CONTEXT_DESCRIPTION,
    )
    ?.value.trim();

  return entryPoint &&
    (IN_APP_AGENT_MESSAGE_ENTRY_POINTS as readonly string[]).includes(
      entryPoint,
    )
    ? { message_entry_point: entryPoint }
    : {};
}

function sanitizeUserContext(context: InAppAgentContext): InAppAgentContext {
  return context.flatMap((item) => {
    if (!USER_CONTEXT_DESCRIPTIONS.has(item.description)) {
      return [];
    }

    const value = item.value.trim();

    if (!value || value.length > MAX_CONTEXT_VALUE_LENGTH) {
      return [];
    }

    return [{ description: item.description, value }];
  });
}

function sanitizeCurrentUrlContext(value: string, projectId: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    return undefined;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return undefined;
  }

  const projectPathPrefix = `/project/${projectId}`;

  if (
    parsedUrl.pathname !== projectPathPrefix &&
    !parsedUrl.pathname.startsWith(`${projectPathPrefix}/`)
  ) {
    return undefined;
  }

  if (parsedUrl.pathname.length > MAX_SCREEN_CONTEXT_PATH_LENGTH) {
    return undefined;
  }

  const searchParams = Array.from(parsedUrl.searchParams.entries())
    .slice(0, MAX_SCREEN_CONTEXT_SEARCH_PARAMS)
    .flatMap(([key, paramValue]) => {
      if (
        key.length > MAX_CONTEXT_KEY_LENGTH ||
        paramValue.length > MAX_CONTEXT_VALUE_LENGTH
      ) {
        return [];
      }

      return [{ key, value: paramValue }];
    });

  return {
    pathname: parsedUrl.pathname,
    searchParams,
    hash: parsedUrl.hash.slice(0, MAX_SCREEN_CONTEXT_HASH_LENGTH),
  };
}

export function createInAppAgentUserContext(params: {
  userName?: string | null;
  timezone?: string | null;
  languages: string[];
}): InAppAgentContext {
  const context: InAppAgentContext = [];
  const userName = params.userName?.trim();
  const timezone = params.timezone?.trim();
  const languages = params.languages
    .map((language) => language.trim())
    .filter(Boolean);

  if (userName) {
    context.push({
      description: "user_name",
      value: userName,
    });
  }

  if (timezone) {
    context.push({
      description: "current_timezone",
      value: timezone,
    });
  }

  if (languages.length > 0) {
    context.push({
      description: "browser_languages",
      value: languages.join(", "),
    });
  }

  return context;
}
