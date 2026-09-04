import { type APIScoreV3 } from "../../features/scores/interfaces/api/v3/schemas";
import {
  buildDashboardWidgetPath,
  buildDashboardsPath,
  buildExperimentPath,
  buildMonitorsPath,
  buildSessionPath,
  buildTracePath,
} from "../../utils/productUrl";
import { getProductBaseUrl } from "./baseUrl";

export * from "../../utils/productUrl";

type ProductUrlQuery = Record<string, string | string[] | null | undefined>;

const buildProductUrl = (path: string, query?: ProductUrlQuery) => {
  const baseUrl = getProductBaseUrl();
  const basePath = baseUrl.pathname.replace(/\/$/, "");
  const url = new URL(`${basePath}${path}`, baseUrl);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (!value) {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item) {
          url.searchParams.append(key, item);
        }
      });
    } else {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
};

export const buildTraceUrl = (params: { projectId: string; traceId: string }) =>
  buildProductUrl(buildTracePath(params));

export const buildObservationUrl = (params: {
  projectId: string;
  traceId: string;
  observationId: string;
}) => buildProductUrl(buildTracePath(params));

export const buildSessionUrl = (params: {
  projectId: string;
  sessionId: string;
}) => buildProductUrl(buildSessionPath(params));

export const buildCommentObjectUrl = (params: {
  projectId: string;
  objectType: string;
  objectId: string;
}) => {
  if (params.objectType === "TRACE") {
    return buildTraceUrl({
      projectId: params.projectId,
      traceId: params.objectId,
    });
  }

  if (params.objectType === "SESSION") {
    return buildSessionUrl({
      projectId: params.projectId,
      sessionId: params.objectId,
    });
  }

  return undefined;
};

export const buildScoreTargetUrl = (params: {
  projectId: string;
  traceId?: string | null;
  observationId?: string | null;
  sessionId?: string | null;
}) => {
  if (params.traceId && params.observationId) {
    return buildObservationUrl({
      projectId: params.projectId,
      traceId: params.traceId,
      observationId: params.observationId,
    });
  }

  if (params.traceId) {
    return buildTraceUrl({
      projectId: params.projectId,
      traceId: params.traceId,
    });
  }

  if (params.sessionId) {
    return buildSessionUrl({
      projectId: params.projectId,
      sessionId: params.sessionId,
    });
  }

  return undefined;
};

export const buildScoreSubjectUrl = (
  projectId: string,
  subject: APIScoreV3["subject"],
): string | undefined => {
  if (!subject) return undefined;

  switch (subject.kind) {
    case "trace":
      return buildScoreTargetUrl({ projectId, traceId: subject.id });
    case "observation":
      return buildScoreTargetUrl({
        projectId,
        traceId: subject.traceId,
        observationId: subject.id,
      });
    case "session":
      return buildScoreTargetUrl({ projectId, sessionId: subject.id });
    case "experiment":
      return buildExperimentUrl({ projectId, experimentId: subject.id });
  }
};

export const buildPromptUrl = (params: {
  projectId: string;
  name: string;
  version?: number;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/prompts/${encodeURIComponent(params.name)}`,
    params.version === undefined
      ? undefined
      : { version: String(params.version) },
  );

export const buildDatasetUrl = (params: {
  projectId: string;
  datasetId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/datasets/${encodeURIComponent(params.datasetId)}/items`,
  );

export const buildDatasetItemUrl = (params: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/datasets/${encodeURIComponent(params.datasetId)}/items/${encodeURIComponent(params.datasetItemId)}`,
  );

export const buildDatasetRunUrl = (params: {
  projectId: string;
  datasetId: string;
  datasetRunId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/datasets/${encodeURIComponent(params.datasetId)}/runs/${encodeURIComponent(params.datasetRunId)}`,
  );

export const buildExperimentUrl = (params: {
  projectId: string;
  experimentId: string;
}) => buildProductUrl(buildExperimentPath(params));

export const buildAnnotationQueueUrl = (params: {
  projectId: string;
  queueId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/annotation-queues/${encodeURIComponent(params.queueId)}`,
  );

export const buildAnnotationQueueItemUrl = (params: {
  projectId: string;
  queueId: string;
  itemId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/annotation-queues/${encodeURIComponent(params.queueId)}/items/${encodeURIComponent(params.itemId)}`,
    { singleItem: "true" },
  );

export const buildModelUrl = (params: { projectId: string; modelId: string }) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/settings/models/${encodeURIComponent(params.modelId)}`,
  );

export const buildMonitorUrl = (params: {
  projectId: string;
  monitorId: string;
}) =>
  buildProductUrl(
    `${buildMonitorsPath(params)}/${encodeURIComponent(params.monitorId)}`,
  );

export const buildDashboardWidgetUrl = (params: {
  projectId: string;
  widgetId: string;
}) => buildProductUrl(buildDashboardWidgetPath(params));

export const buildDashboardUrl = (params: {
  projectId: string;
  dashboardId: string;
}) =>
  buildProductUrl(
    `${buildDashboardsPath(params)}/${encodeURIComponent(params.dashboardId)}`,
  );

export const buildEvaluatorUrl = (params: {
  projectId: string;
  evaluatorId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/evals/v2/${encodeURIComponent(params.evaluatorId)}`,
  );
