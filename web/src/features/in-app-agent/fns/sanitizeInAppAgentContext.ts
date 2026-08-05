import type { AgUiRunAgentInput } from "@langfuse/shared/in-app-agent";
import type { FilterState } from "@langfuse/shared";
import { CURRENT_URL_CONTEXT_DESCRIPTION } from "@/src/features/in-app-agent/constants";

type InAppAgentContext = AgUiRunAgentInput["context"];

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

export function sanitizeInAppAgentContext(
  context: InAppAgentContext,
  projectId: string,
  viewFilters?: FilterState,
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
    const serializedResolvedCurrentUrl =
      currentUrl && viewFilters
        ? JSON.stringify({
            ...currentUrl,
            savedView: { filters: viewFilters },
          })
        : undefined;
    const boundedCurrentUrl =
      serializedResolvedCurrentUrl &&
      serializedResolvedCurrentUrl.length <= MAX_SCREEN_CONTEXT_JSON_LENGTH
        ? serializedResolvedCurrentUrl
        : serializedCurrentUrl;

    if (
      boundedCurrentUrl &&
      boundedCurrentUrl.length <= MAX_SCREEN_CONTEXT_JSON_LENGTH
    ) {
      sanitizedContext.push({
        description: CURRENT_URL_CONTEXT_DESCRIPTION,
        value: boundedCurrentUrl,
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
