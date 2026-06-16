import { TRPCError } from "@trpc/server";

import {
  type WebCalloutEndpointInput,
  type WebCalloutInvokeInput,
  type WebCalloutPayload,
} from "@/src/features/web-callouts/types";
import {
  decryptWebCalloutHeaders,
  processHeadersForStorage,
} from "@/src/features/web-callouts/server/headers";
import { assertTargetBelongsToProject } from "@/src/features/web-callouts/server/targetValidation";
import {
  assertValidCalloutUrl,
  validateWebCalloutUrl,
  webCalloutWhitelist,
} from "@/src/features/web-callouts/server/urlValidation";
import { fetchWithSecureRedirects, logger } from "@langfuse/shared/src/server";
import {
  type PrismaClient,
  type WebCalloutEndpoint,
} from "@langfuse/shared/src/db";

export const WEB_CALLOUT_TIMEOUT_MS = 5_000;
const WEB_CALLOUT_MAX_REDIRECTS = 10;

type StoredEndpoint = WebCalloutEndpoint;

export type SafeWebCalloutEndpoint = Omit<StoredEndpoint, "requestHeaders">;

export const toSafeWebCalloutEndpoint = (
  endpoint: StoredEndpoint,
): SafeWebCalloutEndpoint => {
  const { requestHeaders: _requestHeaders, ...safeEndpoint } = endpoint;
  return safeEndpoint;
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

  const shouldMergeExistingHeaders =
    Object.keys(input.requestHeaders).length > 0;
  const headers = processHeadersForStorage({
    inputHeaders: input.requestHeaders,
    existingHeaders:
      existingEndpoint && shouldMergeExistingHeaders
        ? decryptWebCalloutHeaders(existingEndpoint.requestHeaders)
        : {},
  });

  const data = {
    name: input.name,
    url: input.url,
    enabled: input.enabled,
    toastMessage: input.toastMessage,
    requestHeaders: headers.requestHeaders,
    requestHeaderKeys: headers.requestHeaderKeys,
  };

  const endpoint = input.id
    ? await prisma.webCalloutEndpoint.update({
        where: { id: input.id },
        data,
      })
    : await prisma.webCalloutEndpoint.create({
        data: {
          ...data,
          projectId,
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
  const decryptedHeaders = decryptWebCalloutHeaders(endpoint.requestHeaders);
  const outboundHeaders = new Headers();
  outboundHeaders.set("Content-Type", "application/json");
  outboundHeaders.set("User-Agent", "Langfuse/1.0");

  for (const [name, value] of Object.entries(decryptedHeaders)) {
    outboundHeaders.set(name, value);
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
        additionalSensitiveHeaders: Object.keys(decryptedHeaders),
        redirectValidation: {
          validateUrl: validateWebCalloutUrl,
          whitelist: webCalloutWhitelist(),
          logContext: "Web callout",
        },
      },
    );
    await discardResponseBody(response);

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

const discardResponseBody = async (response: Response) => {
  if (!response.body) {
    return;
  }

  try {
    await response.body.cancel();
  } catch (error) {
    logger.warn("Failed to discard web callout response body", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
