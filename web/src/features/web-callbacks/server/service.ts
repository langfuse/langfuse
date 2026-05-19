import { TRPCError } from "@trpc/server";

import { env } from "@/src/env.mjs";
import {
  type WebCallbackEndpointInput,
  type WebCallbackHeaders,
  WebCallbackHeadersSchema,
} from "@/src/features/web-callbacks/types";
import {
  createDisplayHeaders,
  logger,
  type WebhookValidationWhitelist,
  validateWebhookURL,
  whitelistFromEnv,
} from "@langfuse/shared/src/server";
import {
  type WebCallbackEndpoint,
  type PrismaClient,
} from "@langfuse/shared/src/db";

const BLOCKED_HEADER_NAMES = new Set([
  "content-length",
  "content-type",
  "cookie",
  "host",
]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const LOCAL_DEVELOPMENT_CALLBACK_WHITELIST: WebhookValidationWhitelist = {
  hosts: ["localhost", "127.0.0.1", "[::1]"],
  ips: ["127.0.0.1", "::1"],
  ip_ranges: ["127.0.0.0/8", "::1/128"],
};

const webCallbackWhitelist = (): WebhookValidationWhitelist => {
  const whitelist = whitelistFromEnv();

  if (env.NODE_ENV !== "development") {
    return whitelist;
  }

  return {
    hosts: unique([
      ...whitelist.hosts,
      ...LOCAL_DEVELOPMENT_CALLBACK_WHITELIST.hosts,
    ]),
    ips: unique([
      ...whitelist.ips,
      ...LOCAL_DEVELOPMENT_CALLBACK_WHITELIST.ips,
    ]),
    ip_ranges: unique([
      ...whitelist.ip_ranges,
      ...LOCAL_DEVELOPMENT_CALLBACK_WHITELIST.ip_ranges,
    ]),
  };
};

const validateWebCallbackUrl = (
  url: string,
  whitelist = webCallbackWhitelist(),
) => validateWebhookURL(url, whitelist, { allowedPorts: "any" });

type StoredEndpoint = WebCallbackEndpoint;

export type SafeWebCallbackEndpoint = Omit<
  StoredEndpoint,
  "displayHeaders" | "requestHeaders"
> & {
  displayHeaders: WebCallbackHeaders;
};

export const toSafeWebCallbackEndpoint = (
  endpoint: StoredEndpoint,
): SafeWebCallbackEndpoint => {
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

export type BrowserWebCallbackEndpoint =
  | {
      enabled: false;
      name: null;
      url: null;
      requestHeaders: Record<string, string>;
      hasSecretHeaders: false;
    }
  | {
      enabled: true;
      name: string;
      url: string;
      toastMessage: string;
      timeoutMs: number;
      requestHeaders: Record<string, string>;
      hasSecretHeaders: boolean;
    };

export const toBrowserWebCallbackEndpoint = (
  endpoint: StoredEndpoint | null | undefined,
): BrowserWebCallbackEndpoint => {
  if (!endpoint?.enabled) {
    return {
      enabled: false,
      name: null,
      url: null,
      requestHeaders: {},
      hasSecretHeaders: false,
    };
  }

  const storedRequestHeaders = parseStoredHeaders(endpoint.requestHeaders);
  const displayHeaders = parseStoredHeaders(endpoint.displayHeaders, {
    fallback: maskStoredHeaders(storedRequestHeaders),
  });
  const headerEntries = Object.entries(displayHeaders);

  return {
    enabled: true,
    name: endpoint.name,
    url: endpoint.url,
    toastMessage: endpoint.toastMessage,
    timeoutMs: endpoint.timeoutMs,
    requestHeaders: Object.fromEntries(
      headerEntries
        .filter(([, header]) => !header.secret)
        .map(([name, header]) => [name, header.value]),
    ),
    hasSecretHeaders: headerEntries.some(([, header]) => header.secret),
  };
};

export const upsertWebCallbackEndpoint = async ({
  prisma,
  projectId,
  input,
}: {
  prisma: PrismaClient;
  projectId: string;
  input: WebCallbackEndpointInput;
}) => {
  await assertValidCallbackUrl(input.url);

  const existingEndpoint = input.id
    ? await prisma.webCallbackEndpoint.findFirst({
        where: { id: input.id, projectId },
      })
    : null;

  if (input.id && !existingEndpoint) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Web callback endpoint not found",
    });
  }

  if (!input.id) {
    const endpointCount = await prisma.webCallbackEndpoint.count({
      where: { projectId },
    });

    if (endpointCount >= 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Only one web callback endpoint can be configured per project.",
      });
    }
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
    ? await prisma.webCallbackEndpoint.update({
        where: { id: input.id },
        data: {
          name: input.name,
          url: input.url,
          enabled: input.enabled,
          toastMessage: input.toastMessage,
          timeoutMs: input.timeoutMs,
          requestHeaders: headers.requestHeaders,
          displayHeaders: headers.displayHeaders,
        },
      })
    : await prisma.webCallbackEndpoint.create({
        data: {
          projectId,
          name: input.name,
          url: input.url,
          enabled: input.enabled,
          toastMessage: input.toastMessage,
          timeoutMs: input.timeoutMs,
          requestHeaders: headers.requestHeaders,
          displayHeaders: headers.displayHeaders,
        },
      });

  return toSafeWebCallbackEndpoint(endpoint);
};

const assertValidCallbackUrl = async (url: string) => {
  try {
    await validateWebCallbackUrl(url);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error
          ? `Invalid callback URL: ${error.message}`
          : "Invalid callback URL",
    });
  }
};

const processHeadersForStorage = ({
  inputHeaders,
  existingRequestHeaders,
  existingDisplayHeaders,
}: {
  inputHeaders: WebCallbackHeaders;
  existingRequestHeaders: WebCallbackHeaders;
  existingDisplayHeaders: WebCallbackHeaders;
}): {
  requestHeaders: WebCallbackHeaders;
  displayHeaders: WebCallbackHeaders;
} => {
  const requestHeaders: WebCallbackHeaders = {};
  const displayHeaders: WebCallbackHeaders = {};
  const normalizedHeaderNames = new Set<string>();

  for (const [rawName, rawHeader] of Object.entries(inputHeaders)) {
    const name = rawName.trim();
    const value = rawHeader.value.trim();

    if (rawHeader.secret) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Secret headers are not supported for browser web callbacks. Configure only browser-visible headers.",
      });
    }

    if (!name || !value) {
      const existingHeader = existingRequestHeaders[name];

      if (!name || !existingHeader) {
        continue;
      }

      validateHeaderName(name);
      const normalizedName = name.toLowerCase();
      if (normalizedHeaderNames.has(normalizedName)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Header "${name}" is configured more than once.`,
        });
      }
      normalizedHeaderNames.add(normalizedName);

      if (rawHeader.secret !== existingHeader.secret) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Header "${name}" secret status can only be changed when providing a value.`,
        });
      }

      requestHeaders[name] = existingHeader;
      displayHeaders[name] =
        existingDisplayHeaders[name] ?? maskStoredHeader(existingHeader);
      continue;
    }

    validateHeaderName(name);
    const normalizedName = name.toLowerCase();
    if (normalizedHeaderNames.has(normalizedName)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${name}" is configured more than once.`,
      });
    }
    normalizedHeaderNames.add(normalizedName);

    const plainHeader = {
      secret: false,
      value,
    };

    requestHeaders[name] = plainHeader;
    displayHeaders[name] = createDisplayHeaders({ [name]: plainHeader })[name];
  }

  return { requestHeaders, displayHeaders };
};

const parseStoredHeaders = (
  value: unknown,
  options?: { fallback?: WebCallbackHeaders },
): WebCallbackHeaders => {
  if (value === null || value === undefined) {
    return options?.fallback ?? {};
  }

  const parsed = WebCallbackHeadersSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  if (options?.fallback) {
    return options.fallback;
  }

  logger.warn("Failed to parse web callback headers", {
    error: parsed.error.message,
  });

  return {};
};

const maskStoredHeaders = (headers: WebCallbackHeaders): WebCallbackHeaders =>
  Object.fromEntries(
    Object.entries(headers).map(([name, header]) => [
      name,
      maskStoredHeader(header),
    ]),
  );

const maskStoredHeader = (
  header: WebCallbackHeaders[string],
): WebCallbackHeaders[string] => ({
  secret: header.secret,
  value: header.secret ? "****" : header.value,
});

const validateHeaderName = (name: string) => {
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
};

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));
