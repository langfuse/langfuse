import type { AgUiRunAgentInput } from "@/src/ee/features/in-app-agent/schema";

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
const MAX_SCREEN_CONTEXT_SEARCH_PARAMS = 30;
const MAX_CONTEXT_KEY_LENGTH = 80;
const MAX_CONTEXT_VALUE_LENGTH = 500;
const MAX_SCREEN_CONTEXT_PATH_LENGTH = 500;
const MAX_SCREEN_CONTEXT_HASH_LENGTH = 200;
const MAX_SCREEN_CONTEXT_JSON_LENGTH = 4_000;
const USER_CONTEXT_DESCRIPTIONS = new Set([
  "user_name",
  "current_timezone",
  "browser_languages",
]);

export function getInAppAgentScreenContextDescription(
  currentUrl: string,
): InAppAgentScreenContextDescription {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(currentUrl, "https://langfuse.local");
  } catch {
    return { type: "page" };
  }

  const rawPathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  const projectSegmentIndex = rawPathSegments.indexOf("project");

  if (
    projectSegmentIndex === -1 ||
    rawPathSegments.length <= projectSegmentIndex + 2
  ) {
    return { type: "page" };
  }

  let routeSegments: string[];

  try {
    routeSegments = rawPathSegments
      .slice(projectSegmentIndex + 2)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return { type: "page" };
  }

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
