import { getInAppAgentProjectRoute } from "@/src/features/in-app-agent/fns/getInAppAgentProjectRoute";
import { type InAppAgentScreenContextDescription } from "@/src/features/in-app-agent/types";

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
