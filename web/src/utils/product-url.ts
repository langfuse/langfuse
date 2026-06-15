import { env } from "@/src/env.mjs";

const LOCALHOST_HOST_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i;

const getProductBaseUrl = () => {
  const rawBaseUrl = env.NEXTAUTH_URL;
  const baseUrl = new URL(
    /^https?:\/\//i.test(rawBaseUrl)
      ? rawBaseUrl
      : `${LOCALHOST_HOST_PATTERN.test(rawBaseUrl) ? "http" : "https"}://${rawBaseUrl}`,
  );

  baseUrl.pathname = baseUrl.pathname.replace(/\/api\/auth\/?$/, "/");
  baseUrl.search = "";
  baseUrl.hash = "";

  return baseUrl;
};

const buildProductUrl = (path: string, query?: Record<string, string>) => {
  const baseUrl = getProductBaseUrl();
  const basePath = baseUrl.pathname.replace(/\/$/, "");
  const url = new URL(`${basePath}${path}`, baseUrl);

  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
};

export const buildTraceUrl = (params: { projectId: string; traceId: string }) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/traces/${encodeURIComponent(params.traceId)}`,
  );

export const buildObservationUrl = (params: {
  projectId: string;
  traceId: string;
  observationId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/traces/${encodeURIComponent(params.traceId)}`,
    { observation: params.observationId },
  );

export const buildSessionUrl = (params: {
  projectId: string;
  sessionId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/sessions/${encodeURIComponent(params.sessionId)}`,
  );

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

export const buildEvaluatorUrl = (params: {
  projectId: string;
  evaluatorId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/evals/templates/${encodeURIComponent(params.evaluatorId)}`,
  );
