import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";

import { beforeEach, describe, expect, it, vi } from "vitest";

const cutoff = vi.hoisted(() => ({
  current: undefined as string | undefined,
}));
const mocks = vi.hoisted(() => ({
  recordIncrement: vi.fn(),
  publishToOtelIngestionQueue: vi.fn(async () => ({ id: "job" })),
}));

vi.mock(import("@/src/env.mjs"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    env: new Proxy(original.env, {
      get(target, property, receiver) {
        if (property === "LANGFUSE_OTEL_REQUIRE_V4_SDK_ORG_CREATED_CUTOFF") {
          return cutoff.current;
        }
        return Reflect.get(target, property, receiver);
      },
    }),
  };
});

vi.mock("@/src/features/public-api/server/withMiddlewares", () => ({
  withMiddlewares: (handlers: unknown) => handlers,
}));

vi.mock("@/src/features/public-api/server/createAuthedProjectAPIRoute", () => ({
  createAuthedProjectAPIRoute: ({ fn }: { fn: unknown }) => fn,
}));

vi.mock(import("@langfuse/shared/src/server"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    recordIncrement: mocks.recordIncrement,
    markProjectAsOtelUser: vi.fn(async () => undefined),
    OtelIngestionProcessor: class {
      async publishToOtelIngestionQueue() {
        return mocks.publishToOtelIngestionQueue();
      }
    },
  };
});

import {
  isOrganizationCreatedAtOrAfterCutoff,
  OTEL_LEGACY_LANGFUSE_SDK_ERROR,
} from "@/src/features/public-api/server/otelRequireV4Sdk";
import otelRoute from "@/src/pages/api/public/otel/v1/traces";

const CUTOFF = "2026-10-21T00:00:00.000Z";
const METRIC = "langfuse.public_api.otel_legacy_sdk_rejected";

type RoutePost = (params: {
  req: IncomingMessage;
  res: { status: (code: number) => void };
  auth: {
    scope: {
      isIngestionSuspended: boolean;
      projectId: string;
      orgId: string;
      publicKey: string;
      organizationCreatedAt?: string;
    };
  };
}) => Promise<{ error?: string }>;

const post = (otelRoute as unknown as { POST: RoutePost }).POST;

function request(headers: Record<string, string>) {
  const stream = new PassThrough() as PassThrough & IncomingMessage;
  stream.headers = headers;
  return stream;
}

function otelBody(scopeName: string) {
  return Buffer.from(
    JSON.stringify({
      resourceSpans: [
        {
          scopeSpans: [
            {
              scope: { name: scopeName },
              spans: [
                {
                  traceId: "ab".repeat(16),
                  spanId: "cd".repeat(8),
                  name: "span",
                },
              ],
            },
          ],
        },
      ],
    }),
  );
}

function authFor(organizationCreatedAt?: string) {
  return {
    scope: {
      isIngestionSuspended: false,
      projectId: "project-1",
      orgId: "org-1",
      publicKey: "pk-lf-test",
      organizationCreatedAt,
    },
  };
}

async function send(params: {
  headers?: Record<string, string>;
  scopeName?: string;
  organizationCreatedAt?: string;
}) {
  const body = otelBody(params.scopeName ?? "opentelemetry");
  const req = request({
    "content-type": "application/json",
    "content-length": String(body.byteLength),
    ...params.headers,
  });
  const res = { status: vi.fn() };
  const pending = post({
    req,
    res,
    auth: authFor(params.organizationCreatedAt),
  });
  req.end(body);
  const result = await pending;
  return { res, result };
}

describe("OTel v4 SDK organization cutoff", () => {
  beforeEach(() => {
    cutoff.current = undefined;
    mocks.recordIncrement.mockClear();
    mocks.publishToOtelIngestionQueue.mockClear();
  });

  it("includes an organization created at the cutoff and excludes one created before it", () => {
    expect(isOrganizationCreatedAtOrAfterCutoff(CUTOFF, CUTOFF)).toBe(true);
    expect(
      isOrganizationCreatedAtOrAfterCutoff("2026-10-20T23:59:59.999Z", CUTOFF),
    ).toBe(false);
    expect(isOrganizationCreatedAtOrAfterCutoff(CUTOFF, undefined)).toBe(false);
    expect(isOrganizationCreatedAtOrAfterCutoff(undefined, CUTOFF)).toBe(false);
    expect(isOrganizationCreatedAtOrAfterCutoff("not-a-date", CUTOFF)).toBe(
      false,
    );
  });

  it("rejects an old Langfuse SDK for a cutoff organization", async () => {
    cutoff.current = CUTOFF;

    const { res, result } = await send({
      organizationCreatedAt: CUTOFF,
      headers: {
        "x-langfuse-sdk-name": "python",
        "x-langfuse-sdk-version": "3.9.0",
        "x-langfuse-ingestion-version": "4",
      },
      scopeName: "langfuse-sdk",
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(result.error).toBe(OTEL_LEGACY_LANGFUSE_SDK_ERROR);
    expect(result.error).toContain(
      "Upgrade to the latest Langfuse SDKs, or send via OpenTelemetry directly.",
    );
    expect(result.error).toContain(
      "https://langfuse.com/docs/observability/sdk/upgrade-path",
    );
    expect(result.error).toContain(
      "https://langfuse.com/integrations/native/opentelemetry/migration-to-v4.md",
    );
    expect(mocks.publishToOtelIngestionQueue).not.toHaveBeenCalled();
    expect(mocks.recordIncrement).toHaveBeenCalledWith(METRIC, 1, {
      sdk: "python",
      version_bucket: "3",
    });
    expect(mocks.recordIncrement.mock.calls[0]?.[2]).not.toHaveProperty(
      "orgId",
    );
  });

  it.each([
    {
      label: "current Python SDK",
      headers: {
        "x-langfuse-sdk-name": "python",
        "x-langfuse-sdk-version": "4.0.0",
      },
      scopeName: "langfuse-sdk",
    },
    {
      label: "current JS SDK",
      headers: {
        "x-langfuse-sdk-name": "javascript",
        "x-langfuse-sdk-version": "5.0.0",
      },
      scopeName: "langfuse-sdk",
    },
    {
      label: "plain OpenTelemetry without an ingestion-version header",
      headers: {},
      scopeName: "opentelemetry.instrumentation.requests",
    },
    {
      label: "plain OpenTelemetry with ingestion-version 4",
      headers: { "x-langfuse-ingestion-version": "4" },
      scopeName: "opentelemetry",
    },
  ])(
    "accepts $label for a cutoff organization",
    async ({ headers, scopeName }) => {
      cutoff.current = CUTOFF;

      const { res, result } = await send({
        organizationCreatedAt: "2026-10-22T00:00:00.000Z",
        headers,
        scopeName,
      });

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(result.error).toBeUndefined();
      expect(mocks.publishToOtelIngestionQueue).toHaveBeenCalledOnce();
      expect(mocks.recordIncrement).not.toHaveBeenCalledWith(
        METRIC,
        expect.anything(),
        expect.anything(),
      );
    },
  );

  it("rejects an old SDK that is visible only from its instrumentation scope", async () => {
    cutoff.current = CUTOFF;

    const { res, result } = await send({
      organizationCreatedAt: CUTOFF,
      scopeName: "langfuse-sdk",
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(result.error).toContain(
      "Upgrade to the latest Langfuse SDKs, or send via OpenTelemetry directly.",
    );
    expect(mocks.publishToOtelIngestionQueue).not.toHaveBeenCalled();
    expect(mocks.recordIncrement).toHaveBeenCalledWith(METRIC, 1, {
      sdk: "scope",
      version_bucket: "scope_only",
    });
  });

  it.each([
    {
      label: "an organization created before the cutoff",
      organizationCreatedAt: "2026-10-20T23:59:59.999Z",
      configured: CUTOFF,
    },
    {
      label: "an unset cutoff",
      organizationCreatedAt: CUTOFF,
      configured: undefined,
    },
    {
      label: "a scope with no organization createdAt",
      organizationCreatedAt: undefined,
      configured: CUTOFF,
    },
  ])(
    "keeps an old Langfuse SDK when $label",
    async ({ organizationCreatedAt, configured }) => {
      cutoff.current = configured;

      const { res, result } = await send({
        organizationCreatedAt,
        headers: {
          "x-langfuse-sdk-name": "python",
          "x-langfuse-sdk-version": "3.9.0",
        },
        scopeName: "langfuse-sdk",
      });

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(result.error).toBeUndefined();
      expect(mocks.publishToOtelIngestionQueue).toHaveBeenCalledOnce();
      expect(mocks.recordIncrement).not.toHaveBeenCalledWith(
        METRIC,
        expect.anything(),
        expect.anything(),
      );
    },
  );
});
