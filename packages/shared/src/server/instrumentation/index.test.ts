import {
  context,
  propagation,
  ROOT_CONTEXT,
  type Span,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeClickHouseQueryTags } from "../clickhouse/queryTags";
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
