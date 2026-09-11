import {
  context,
  propagation,
  ROOT_CONTEXT,
  type Span,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS,
  normalizeClickHouseQueryTags,
} from "../clickhouse/queryTags";
import { contextWithLangfuseProps } from "../headerPropagation";
import { addUserToSpan, instrumentAsync, instrumentSync } from ".";

describe("instrumentation baggage propagation", () => {
  // Baggage only propagates through context.with once a manager is registered.
  const contextManager = new AsyncLocalStorageContextManager();

  beforeAll(() => {
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
  });

  afterAll(() => {
    context.disable();
  });

  it("instrumentAsync keeps worker surface/route across startNewTrace", async () => {
    const workerContext = contextWithLangfuseProps({
      projectId: "project-1",
      clickhouse: { surface: "worker", route: "langfuse.queue.monitor" },
    });

    const tags = await context.with(workerContext, () =>
      instrumentAsync(
        { name: "process monitor", startNewTrace: true },
        async () => normalizeClickHouseQueryTags(),
      ),
    );

    expect(tags).toMatchObject({
      surface: "worker",
      route: "langfuse.queue.monitor",
      projectId: "project-1",
    });
  });

  it("instrumentSync keeps worker surface/route across startNewTrace", () => {
    const workerContext = contextWithLangfuseProps({
      projectId: "project-1",
      clickhouse: { surface: "worker", route: "langfuse.queue.monitor" },
    });

    const tags = context.with(workerContext, () =>
      instrumentSync({ name: "process monitor", startNewTrace: true }, () =>
        normalizeClickHouseQueryTags(),
      ),
    );

    expect(tags).toMatchObject({
      surface: "worker",
      route: "langfuse.queue.monitor",
      projectId: "project-1",
    });
  });

  it("propagates bounded public API caller attribution into ClickHouse tags", () => {
    const publicApiContext = contextWithLangfuseProps({
      headers: {
        "x-langfuse-sdk-name": "langfuse-python",
        "x-langfuse-sdk-version": "4.8.1",
        "user-agent": "Codex CLI/1.2.3",
      },
      projectId: "project-1",
      clickhouse: {
        surface: "publicapi",
        route: "GET /api/public/traces",
      },
    });

    const tags = context.with(publicApiContext, () =>
      normalizeClickHouseQueryTags(),
    );

    expect(tags).toMatchObject({
      surface: "publicapi",
      route: "GET /api/public/traces",
      projectId: "project-1",
      sdkName: "python",
      sdkVersion: "4.8.1",
      userAgent: "Codex CLI/1.2.3",
    });
    expect(tags).not.toHaveProperty("apiKeyId");
  });

  it("rejects public API caller attribution inherited from inbound baggage", () => {
    const inboundContext = propagation.setBaggage(
      ROOT_CONTEXT,
      propagation.createBaggage({
        [CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.sdkName]: { value: "python" },
        [CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.sdkVersion]: {
          value: "attacker-controlled-version",
        },
        [CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.userAgent]: {
          value: "attacker-controlled-user-agent",
        },
      }),
    );

    const tags = context.with(inboundContext, () => {
      const publicApiContext = contextWithLangfuseProps({
        headers: {},
        projectId: "project-1",
        clickhouse: {
          surface: "publicapi",
          route: "GET /api/public/traces",
        },
      });

      return context.with(publicApiContext, () =>
        normalizeClickHouseQueryTags(),
      );
    });

    expect(tags).toMatchObject({
      surface: "publicapi",
      route: "GET /api/public/traces",
      projectId: "project-1",
    });
    expect(tags).not.toHaveProperty("sdkName");
    expect(tags).not.toHaveProperty("sdkVersion");
    expect(tags).not.toHaveProperty("userAgent");
  });

  it("does not add user emails to span attributes or baggage", () => {
    const span = {
      setAttribute: vi.fn(),
    } as unknown as Span;
    const attributes = {
      userId: "user-1",
      email: "user@example.com",
    } as Parameters<typeof addUserToSpan>[0];

    const userContext = context.with(ROOT_CONTEXT, () =>
      addUserToSpan(attributes, span),
    );

    expect(span.setAttribute).toHaveBeenCalledWith("user.id", "user-1");
    expect(span.setAttribute).not.toHaveBeenCalledWith(
      "user.email",
      "user@example.com",
    );
    expect(propagation.getBaggage(userContext!)?.getEntry("user.email")).toBe(
      undefined,
    );
  });
});
