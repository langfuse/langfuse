import { TRPCError } from "@trpc/server";

import { env } from "@/src/env.mjs";
import {
  type WebCalloutEndpointInput,
  type WebCalloutHeaders,
  WebCalloutHeadersSchema,
  type WebCalloutInvokeInput,
  type WebCalloutPayload,
} from "@/src/features/web-callouts/types";
import {
  encryptSecretHeaders,
  decryptSecretHeaders,
  fetchWithSecureRedirects,
  getObservationById,
  getObservationByIdFromEventsTable,
  getTraceById,
  getTraceByIdFromEventsTable,
  getTracesIdentifierForSession,
  getTracesIdentifierForSessionFromEvents,
  logger,
  type RedirectUrlValidator,
  type WebhookValidationWhitelist,
  validateWebhookURL,
  whitelistFromEnv,
} from "@langfuse/shared/src/server";
import {
  type PrismaClient,
  type WebCalloutEndpoint,
} from "@langfuse/shared/src/db";

export const WEB_CALLOUT_TIMEOUT_MS = 5_000;
const WEB_CALLOUT_MAX_REDIRECTS = 10;
const WEB_CALLOUT_MAX_HEADER_COUNT = 20;
const WEB_CALLOUT_MAX_HEADER_NAME_BYTES = 128;
const WEB_CALLOUT_MAX_HEADER_VALUE_BYTES = 4 * 1024;
const WEB_CALLOUT_MAX_TOTAL_HEADER_BYTES = 8 * 1024;

const BLOCKED_HEADER_NAMES = new Set([
  "content-length",
  "content-type",
  "cookie",
  "host",
]);
const SECRET_ONLY_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const LOCAL_DEVELOPMENT_CALLOUT_WHITELIST: WebhookValidationWhitelist = {
  hosts: ["localhost", "127.0.0.1", "[::1]"],
  ips: ["127.0.0.1", "::1"],
  ip_ranges: ["127.0.0.0/8", "::1/128"],
};

const webCalloutWhitelist = (): WebhookValidationWhitelist => {
  const whitelist = whitelistFromEnv();

  if (env.NODE_ENV !== "development") {
    return whitelist;
  }

  return {
    hosts: unique([
      ...whitelist.hosts,
      ...LOCAL_DEVELOPMENT_CALLOUT_WHITELIST.hosts,
    ]),
    ips: unique([...whitelist.ips, ...LOCAL_DEVELOPMENT_CALLOUT_WHITELIST.ips]),
    ip_ranges: unique([
      ...whitelist.ip_ranges,
      ...LOCAL_DEVELOPMENT_CALLOUT_WHITELIST.ip_ranges,
    ]),
  };
};

const validateWebCalloutUrl: RedirectUrlValidator = (
  url,
  whitelist = webCalloutWhitelist(),
) => validateWebhookURL(url, whitelist, { allowedPorts: "any" });

type StoredEndpoint = WebCalloutEndpoint;

export type SafeWebCalloutEndpoint = Omit<
  StoredEndpoint,
  "displayHeaders" | "requestHeaders"
> & {
  displayHeaders: WebCalloutHeaders;
};

export const toSafeWebCalloutEndpoint = (
  endpoint: StoredEndpoint,
): SafeWebCalloutEndpoint => {
  const requestHeaders = parseStoredHeaders(endpoint.requestHeaders);
  const displayHeaders = parseStoredHeaders(endpoint.displayHeaders, {
    fallback: maskStoredHeaders(requestHeaders),
  });
  const {
    requestHeaders: _requestHeaders,
    displayHeaders: _displayHeaders,
    ...safeEndpoint
  } = endpoint;

  return {
    ...safeEndpoint,
    displayHeaders,
  };
};

export type EnabledWebCallout =
  | {
      enabled: false;
      id: null;
      name: null;
      toastMessage: null;
    }
  | {
      enabled: true;
      id: string;
      name: string;
      toastMessage: string;
    };

export const toEnabledWebCallout = (
  endpoint: StoredEndpoint | null | undefined,
): EnabledWebCallout => {
  if (!endpoint?.enabled) {
    return {
      enabled: false,
      id: null,
      name: null,
      toastMessage: null,
    };
  }

  return {
    enabled: true,
    id: endpoint.id,
    name: endpoint.name,
    toastMessage: endpoint.toastMessage,
  };
};

export const upsertWebCalloutEndpoint = async ({
  prisma,
  projectId,
  input,
}: {
  prisma: PrismaClient;
  projectId: string;
  input: WebCalloutEndpointInput;
}) => {
  await assertValidCalloutUrl(input.url);

  const existingEndpoint = input.id
    ? await prisma.webCalloutEndpoint.findFirst({
        where: { id: input.id, projectId },
      })
    : await prisma.webCalloutEndpoint.findFirst({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });

  if (input.id && !existingEndpoint) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Web callout endpoint not found",
    });
  }

  if (!input.id && existingEndpoint) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Only one web callout endpoint can be configured per project.",
    });
  }

  const headers = processHeadersForStorage({
    inputHeaders: input.requestHeaders,
    existingRequestHeaders: existingEndpoint
      ? parseStoredHeaders(existingEndpoint.requestHeaders)
      : {},
    existingDisplayHeaders: existingEndpoint
      ? parseStoredHeaders(existingEndpoint.displayHeaders)
      : {},
  });

  const endpoint = input.id
    ? await prisma.webCalloutEndpoint.update({
        where: { id: input.id },
        data: {
          name: input.name,
          url: input.url,
          enabled: input.enabled,
          toastMessage: input.toastMessage,
          requestHeaders: headers.requestHeaders,
          displayHeaders: headers.displayHeaders,
        },
      })
    : await prisma.webCalloutEndpoint.create({
        data: {
          projectId,
          name: input.name,
          url: input.url,
          enabled: input.enabled,
          toastMessage: input.toastMessage,
          requestHeaders: headers.requestHeaders,
          displayHeaders: headers.displayHeaders,
        },
      });

  return toSafeWebCalloutEndpoint(endpoint);
};

export const invokeWebCalloutEndpoint = async ({
  prisma,
  input,
  useEventsTable,
}: {
  prisma: PrismaClient;
  input: WebCalloutInvokeInput;
  useEventsTable: boolean;
}) => {
  const endpoint = await prisma.webCalloutEndpoint.findFirst({
    where: {
      projectId: input.projectId,
      enabled: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!endpoint) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No enabled web callout is configured.",
    });
  }

  await assertTargetBelongsToProject({
    prisma,
    input,
    useEventsTable,
  });
  await assertValidCalloutUrl(endpoint.url);

  const payload: WebCalloutPayload = {
    version: 1,
    items: [
      {
        projectId: input.projectId,
        traceId: input.traceId,
        observationId: input.observationId,
        sessionId: input.sessionId,
      },
    ],
  };
  const body = JSON.stringify(payload);
  const storedHeaders = parseStoredHeaders(endpoint.requestHeaders);
  const decryptedHeaders = decryptWebCalloutHeaders(storedHeaders);
  const outboundHeaders = new Headers();
  outboundHeaders.set("Content-Type", "application/json");
  outboundHeaders.set("User-Agent", "Langfuse/1.0");

  for (const [name, header] of Object.entries(decryptedHeaders)) {
    outboundHeaders.set(name, header.value);
  }

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    WEB_CALLOUT_TIMEOUT_MS,
  );

  try {
    const { response } = await fetchWithSecureRedirects(
      endpoint.url,
      {
        method: "POST",
        body,
        headers: outboundHeaders,
        signal: abortController.signal,
      },
      {
        maxRedirects: WEB_CALLOUT_MAX_REDIRECTS,
        additionalSensitiveHeaders: Object.entries(decryptedHeaders)
          .filter(([, header]) => header.secret)
          .map(([name]) => name),
        redirectValidation: {
          validateUrl: validateWebCalloutUrl,
          whitelist: webCalloutWhitelist(),
          logContext: "Web callout",
        },
      },
    );

    if (!response.ok) {
      logger.warn("Web callout returned non-2xx status", {
        projectId: input.projectId,
        endpointId: endpoint.id,
        status: response.status,
      });

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Web callout endpoint returned HTTP ${response.status}.`,
      });
    }

    return {
      success: true as const,
      status: response.status,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    logger.warn("Web callout request failed", {
      projectId: input.projectId,
      endpointId: endpoint.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    if (abortController.signal.aborted) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Web callout timed out after 5 seconds.",
      });
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Web callout request failed.",
    });
  } finally {
    clearTimeout(timeout);
  }
};

const assertTargetBelongsToProject = async ({
  prisma,
  input,
  useEventsTable,
}: {
  prisma: PrismaClient;
  input: WebCalloutInvokeInput;
  useEventsTable: boolean;
}) => {
  if (!input.traceId && !input.sessionId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Trace or session id is required.",
    });
  }

  const trace = input.traceId
    ? await getTraceForProject({
        traceId: input.traceId,
        projectId: input.projectId,
        useEventsTable,
      })
    : null;

  if (input.traceId && !trace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Trace not found in project.",
    });
  }

  if (input.observationId) {
    if (!input.traceId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Observation callouts require a trace id.",
      });
    }

    const observation = await getObservationForProject({
      observationId: input.observationId,
      traceId: input.traceId,
      projectId: input.projectId,
      useEventsTable,
    });

    if (!observation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Observation not found in project.",
      });
    }
  }

  if (input.sessionId) {
    if (trace?.sessionId && trace.sessionId !== input.sessionId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Trace does not belong to the provided session.",
      });
    }

    const sessionExists = await sessionBelongsToProject({
      prisma,
      projectId: input.projectId,
      sessionId: input.sessionId,
      useEventsTable,
    });

    if (!sessionExists) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Session not found in project.",
      });
    }
  }
};

const getTraceForProject = async ({
  traceId,
  projectId,
  useEventsTable,
}: {
  traceId: string;
  projectId: string;
  useEventsTable: boolean;
}) => {
  if (useEventsTable) {
    const trace = await tryGetTraceFromEvents({ traceId, projectId });
    if (trace) return trace;
  }

  const trace = await tryGetTrace({ traceId, projectId });
  if (trace) return trace;

  if (shouldTryEventsTableFallback(useEventsTable)) {
    return tryGetTraceFromEvents({ traceId, projectId });
  }

  return undefined;
};

const getObservationForProject = async ({
  observationId,
  traceId,
  projectId,
  useEventsTable,
}: {
  observationId: string;
  traceId: string;
  projectId: string;
  useEventsTable: boolean;
}) => {
  if (useEventsTable) {
    const observation = await tryGetObservationFromEvents({
      observationId,
      traceId,
      projectId,
    });
    if (observation) return observation;
  }

  const observation = await tryGetObservation({
    observationId,
    traceId,
    projectId,
  });
  if (observation) return observation;

  if (shouldTryEventsTableFallback(useEventsTable)) {
    return tryGetObservationFromEvents({ observationId, traceId, projectId });
  }

  return undefined;
};

const tryGetTrace = async ({
  traceId,
  projectId,
}: {
  traceId: string;
  projectId: string;
}) => {
  try {
    return await getTraceById({
      traceId,
      projectId,
      excludeInputOutput: true,
      excludeMetadata: true,
      clickhouseFeatureTag: "web-callouts",
    });
  } catch (error) {
    logger.warn("Failed to validate web callout trace via traces table", {
      projectId,
      traceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return undefined;
  }
};

const tryGetTraceFromEvents = async ({
  traceId,
  projectId,
}: {
  traceId: string;
  projectId: string;
}) => {
  try {
    return await getTraceByIdFromEventsTable({
      traceId,
      projectId,
      renderingProps: {
        truncated: true,
        shouldJsonParse: false,
      },
      clickhouseFeatureTag: "web-callouts",
    });
  } catch (error) {
    logger.warn("Failed to validate web callout trace via events table", {
      projectId,
      traceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return undefined;
  }
};

const tryGetObservation = async ({
  observationId,
  traceId,
  projectId,
}: {
  observationId: string;
  traceId: string;
  projectId: string;
}) => {
  try {
    return await getObservationById({
      id: observationId,
      projectId,
      traceId,
      fetchWithInputOutput: false,
      renderingProps: {
        truncated: true,
        shouldJsonParse: false,
      },
    });
  } catch {
    return undefined;
  }
};

const tryGetObservationFromEvents = async ({
  observationId,
  traceId,
  projectId,
}: {
  observationId: string;
  traceId: string;
  projectId: string;
}) => {
  try {
    return await getObservationByIdFromEventsTable({
      id: observationId,
      projectId,
      traceId,
      fetchWithInputOutput: false,
      renderingProps: {
        truncated: true,
        shouldJsonParse: false,
      },
    });
  } catch (error) {
    logger.warn("Failed to validate web callout observation via events table", {
      projectId,
      observationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return undefined;
  }
};

const sessionBelongsToProject = async ({
  prisma,
  projectId,
  sessionId,
  useEventsTable,
}: {
  prisma: PrismaClient;
  projectId: string;
  sessionId: string;
  useEventsTable: boolean;
}) => {
  const postgresSession = await prisma.traceSession.findFirst({
    where: {
      id: sessionId,
      projectId,
    },
    select: {
      id: true,
    },
  });

  if (postgresSession) {
    return true;
  }

  const traces = useEventsTable
    ? await tryGetTracesIdentifierForSessionFromEvents({
        projectId,
        sessionId,
      })
    : await tryGetTracesIdentifierForSession({
        projectId,
        sessionId,
      });

  if (traces.length > 0) {
    return true;
  }

  if (shouldTryEventsTableFallback(useEventsTable)) {
    const eventTraces = await tryGetTracesIdentifierForSessionFromEvents({
      projectId,
      sessionId,
    });
    return eventTraces.length > 0;
  }

  return false;
};

const tryGetTracesIdentifierForSession = async ({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) => {
  try {
    return await getTracesIdentifierForSession(projectId, sessionId);
  } catch (error) {
    logger.warn("Failed to validate web callout session via traces table", {
      projectId,
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
};

const tryGetTracesIdentifierForSessionFromEvents = async ({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) => {
  try {
    return await getTracesIdentifierForSessionFromEvents(projectId, sessionId);
  } catch (error) {
    logger.warn("Failed to validate web callout session via events table", {
      projectId,
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
};

const shouldTryEventsTableFallback = (useEventsTable: boolean) =>
  !useEventsTable &&
  (env.LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS === "true" ||
    env.LANGFUSE_ENABLE_EVENTS_TABLE_UI === "true");

const assertValidCalloutUrl = async (url: string) => {
  try {
    await validateWebCalloutUrl(url);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error
          ? `Invalid web callout URL: ${error.message}`
          : "Invalid web callout URL",
    });
  }
};

const processHeadersForStorage = ({
  inputHeaders,
  existingRequestHeaders,
  existingDisplayHeaders,
}: {
  inputHeaders: WebCalloutHeaders;
  existingRequestHeaders: WebCalloutHeaders;
  existingDisplayHeaders: WebCalloutHeaders;
}): {
  requestHeaders: WebCalloutHeaders;
  displayHeaders: WebCalloutHeaders;
} => {
  const requestHeaders: WebCalloutHeaders = {};
  const displayHeaders: WebCalloutHeaders = {};
  const normalizedHeaderNames = new Set<string>();
  let configuredHeaderCount = 0;
  let totalHeaderBytes = 0;

  for (const [rawName, rawHeader] of Object.entries(inputHeaders)) {
    const name = rawName.trim();
    const value = rawHeader.value.trim();

    if (!name) {
      continue;
    }

    validateHeaderName(name, rawHeader.secret);
    const normalizedName = name.toLowerCase();
    if (normalizedHeaderNames.has(normalizedName)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${name}" is configured more than once.`,
      });
    }
    normalizedHeaderNames.add(normalizedName);

    const existingHeader = findExistingHeader(
      name,
      existingRequestHeaders,
      existingDisplayHeaders,
    );

    if (!value || value === existingHeader?.display?.value) {
      if (!existingHeader?.request) {
        continue;
      }

      const limits = assertAndAddHeaderLimits({
        name,
        value: existingHeader.display?.value ?? value,
        headerCount: configuredHeaderCount,
        totalHeaderBytes,
      });
      configuredHeaderCount = limits.headerCount;
      totalHeaderBytes = limits.totalHeaderBytes;

      if (rawHeader.secret !== existingHeader.request.secret) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Header "${name}" secret status can only be changed when providing a value.`,
        });
      }

      requestHeaders[name] = existingHeader.request;
      displayHeaders[name] =
        existingHeader.display ?? maskStoredHeader(existingHeader.request);
      continue;
    }

    const limits = assertAndAddHeaderLimits({
      name,
      value,
      headerCount: configuredHeaderCount,
      totalHeaderBytes,
    });
    configuredHeaderCount = limits.headerCount;
    totalHeaderBytes = limits.totalHeaderBytes;

    const plainHeader = {
      secret: rawHeader.secret,
      value,
    };
    const storedHeader = rawHeader.secret
      ? encryptSecretHeaders({ [name]: plainHeader })[name]
      : plainHeader;

    requestHeaders[name] = storedHeader;
    displayHeaders[name] = maskStoredHeader(plainHeader);
  }

  return { requestHeaders, displayHeaders };
};

const assertAndAddHeaderLimits = ({
  name,
  value,
  headerCount,
  totalHeaderBytes,
}: {
  name: string;
  value: string;
  headerCount: number;
  totalHeaderBytes: number;
}) => {
  const nextHeaderCount = headerCount + 1;
  if (nextHeaderCount > WEB_CALLOUT_MAX_HEADER_COUNT) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `At most ${WEB_CALLOUT_MAX_HEADER_COUNT} request headers can be configured.`,
    });
  }

  const nameBytes = Buffer.byteLength(name, "utf8");
  if (nameBytes > WEB_CALLOUT_MAX_HEADER_NAME_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Header "${name}" name must be at most ${WEB_CALLOUT_MAX_HEADER_NAME_BYTES} bytes.`,
    });
  }

  const valueBytes = Buffer.byteLength(value, "utf8");
  if (valueBytes > WEB_CALLOUT_MAX_HEADER_VALUE_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Header "${name}" value must be at most ${WEB_CALLOUT_MAX_HEADER_VALUE_BYTES} bytes.`,
    });
  }

  const nextTotalHeaderBytes = totalHeaderBytes + nameBytes + valueBytes;
  if (nextTotalHeaderBytes > WEB_CALLOUT_MAX_TOTAL_HEADER_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Request headers must be at most ${WEB_CALLOUT_MAX_TOTAL_HEADER_BYTES} bytes total.`,
    });
  }

  return {
    headerCount: nextHeaderCount,
    totalHeaderBytes: nextTotalHeaderBytes,
  };
};

const decryptWebCalloutHeaders = (
  headers: WebCalloutHeaders,
): WebCalloutHeaders => {
  const decryptedHeaders = decryptSecretHeaders(headers);

  for (const [name, header] of Object.entries(headers)) {
    if (!header.secret) {
      continue;
    }

    const decryptedHeader = decryptedHeaders[name];
    if (!decryptedHeader?.secret) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Failed to decrypt web callout headers. Please update the web callout configuration.",
      });
    }
  }

  return decryptedHeaders;
};

const findExistingHeader = (
  name: string,
  existingRequestHeaders: WebCalloutHeaders,
  existingDisplayHeaders: WebCalloutHeaders,
) => {
  const existingName = Object.keys(existingRequestHeaders).find(
    (headerName) => headerName.toLowerCase() === name.toLowerCase(),
  );

  if (!existingName) {
    return null;
  }

  return {
    request: existingRequestHeaders[existingName],
    display: existingDisplayHeaders[existingName],
  };
};

const parseStoredHeaders = (
  value: unknown,
  options?: { fallback?: WebCalloutHeaders },
): WebCalloutHeaders => {
  if (value === null || value === undefined) {
    return options?.fallback ?? {};
  }

  const parsed = WebCalloutHeadersSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  if (options?.fallback) {
    return options.fallback;
  }

  logger.warn("Failed to parse web callout headers", {
    error: parsed.error.message,
  });

  return {};
};

const maskStoredHeaders = (headers: WebCalloutHeaders): WebCalloutHeaders =>
  Object.fromEntries(
    Object.entries(headers).map(([name, header]) => [
      name,
      maskStoredHeader(header),
    ]),
  );

const maskStoredHeader = (
  header: WebCalloutHeaders[string],
): WebCalloutHeaders[string] => ({
  secret: header.secret,
  value: header.secret ? "****" : header.value,
});

const validateHeaderName = (name: string, secret: boolean) => {
  const lowerName = name.toLowerCase();

  if (!HEADER_NAME_PATTERN.test(name)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Header "${name}" has an invalid name.`,
    });
  }

  if (BLOCKED_HEADER_NAMES.has(lowerName)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Header "${name}" cannot be configured manually.`,
    });
  }

  if (SECRET_ONLY_HEADER_NAMES.has(lowerName) && !secret) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Header "${name}" must be marked as secret.`,
    });
  }
};

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));
