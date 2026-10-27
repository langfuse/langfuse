import { type NextApiRequest } from "next";

/**
 * Every dynamic API route that tags its ClickHouse queries, as its Next.js page
 * path. A request path matching one of these is reported as the template, so
 * the route names the endpoint rather than the entity and stays bounded.
 * Static routes need no entry. `withMiddlewares.servertest.ts` keeps this
 * list in sync with `web/src/pages/api`.
 */
export const DYNAMIC_API_ROUTE_TEMPLATES = [
  "/api/public/annotation-queues/[queueId]",
  "/api/public/annotation-queues/[queueId]/assignments",
  "/api/public/annotation-queues/[queueId]/items",
  "/api/public/annotation-queues/[queueId]/items/[itemId]",
  "/api/public/comments/[commentId]",
  "/api/public/dataset-items/[datasetItemId]",
  "/api/public/datasets/[name]",
  "/api/public/datasets/[name]/runs",
  "/api/public/datasets/[name]/runs/[runName]",
  "/api/public/integrations/blob-storage/[id]",
  "/api/public/llm-connections/[id]",
  "/api/public/media/[mediaId]",
  "/api/public/models/[modelId]",
  "/api/public/observations/[observationId]",
  "/api/public/organizations/llm-connections/[id]",
  "/api/public/projects/[projectId]",
  "/api/public/projects/[projectId]/apiKeys",
  "/api/public/projects/[projectId]/apiKeys/[apiKeyId]",
  "/api/public/projects/[projectId]/memberships",
  "/api/public/scim/Users/[id]",
  "/api/public/score-configs/[configId]",
  "/api/public/scores/[scoreId]",
  "/api/public/sessions/[sessionId]",
  "/api/public/traces/[traceId]",
  "/api/public/unstable/dashboard-widgets/[widgetId]",
  "/api/public/unstable/dashboards/[dashboardId]",
  "/api/public/unstable/dashboards/[dashboardId]/placements",
  "/api/public/unstable/dashboards/[dashboardId]/placements/[placementId]",
  "/api/public/skills/[skillName]",
  "/api/public/skills/[skillName]/versions/[skillVersion]",
  "/api/public/unstable/skills/[skillName]",
  "/api/public/unstable/skills/[skillName]/versions/[skillVersion]",
  "/api/public/unstable/topic-facets/[facetId]",
  "/api/public/unstable/topics/[topicId]",
  "/api/public/v2/datasets/[datasetName]",
  "/api/public/v2/evaluation-rules/[evaluationRuleId]",
  "/api/public/v2/evaluators/[evaluatorId]",
  "/api/public/v2/evaluators/[evaluatorId]/versions",
  "/api/public/v2/prompts/[promptName]",
  "/api/public/v2/prompts/[promptName]/versions/[promptVersion]",
  "/api/public/v2/scores/[scoreId]",
  "/api/traces/[traceId]/download",
  "/api/traces/[traceId]/observations/[observationId]/io/[field]",
] as const;

const TEMPLATE_SEGMENTS = DYNAMIC_API_ROUTE_TEMPLATES.map((template) =>
  template.split("/"),
);

export const clickHouseRouteForRequest = (req: NextApiRequest) => {
  const { method, pathname } = requestPathForRequest(req);
  return `${method} ${templatePath(pathname)}`;
};

/** The request method and path without search params or fragment. */
export const requestPathForRequest = (req: NextApiRequest) => {
  const method = req.method ?? "UNKNOWN";
  const rawUrl = req.url ?? "";

  try {
    const pathname = rawUrl
      ? new URL(rawUrl, "http://langfuse.local").pathname
      : "";
    return { method, pathname };
  } catch {
    return { method, pathname: stripSearchAndHash(rawUrl) };
  }
};

/**
 * Only dynamic positions are replaced, so a value that equals a fixed segment
 * (`/api/public/traces/api`) keeps the endpoint intact. No two templates match
 * the same path and none overlaps a static route, so the first match is the
 * page Next.js routed to.
 */
const templatePath = (pathname: string) => {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  const segments = normalized.split("/");
  const match = TEMPLATE_SEGMENTS.find(
    (template) =>
      template.length === segments.length &&
      template.every(
        (segment, index) =>
          isDynamicSegment(segment) || segment === segments[index],
      ),
  );
  return match ? match.join("/") : pathname;
};

const isDynamicSegment = (segment: string) => segment.startsWith("[");

const stripSearchAndHash = (url: string) => url.split(/[?#]/, 1)[0] ?? "";
