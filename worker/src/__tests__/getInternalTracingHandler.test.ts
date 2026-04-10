import { describe, expect, it } from "vitest";

import {
  LangfuseInternalTraceEnvironment,
  prepareInternalTraceEvents,
} from "@langfuse/shared/src/server";

describe("prepareInternalTraceEvents", () => {
  it("sets the configured environment on every forwarded event", () => {
    const preparedEvents = prepareInternalTraceEvents({
      events: [
        {
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: "trace-123",
            name: "internal-trace",
            environment: "wrong-environment",
          },
        },
        {
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: "blocked-span",
            traceId: "trace-123",
            name: "RunnableLambda",
            environment: "wrong-environment",
          },
        },
        {
          type: "span-update",
          timestamp: new Date().toISOString(),
          body: {
            id: "blocked-span",
            traceId: "trace-123",
          },
        },
        {
          type: "generation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: "generation-123",
            traceId: "trace-123",
            name: "ChatOpenAI",
          },
        },
        {
          type: "generation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: "generation-123",
            traceId: "trace-123",
            output: {
              role: "assistant",
              content: "Berlin",
            },
          },
        },
        {
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: "allowed-span",
            traceId: "trace-123",
            name: "Retriever",
            environment: "another-environment",
          },
        },
        {
          type: "span-update",
          timestamp: new Date().toISOString(),
          body: {
            id: "allowed-span",
            traceId: "trace-123",
          },
        },
      ],
      environment: LangfuseInternalTraceEnvironment.PromptExperiments,
    });

    expect(preparedEvents.map((event) => event.body.id)).not.toContain(
      "blocked-span",
    );
    expect(preparedEvents).toHaveLength(5);
    expect(
      preparedEvents.every(
        (event) =>
          event.body.environment ===
          LangfuseInternalTraceEnvironment.PromptExperiments,
      ),
    ).toBe(true);
  });

  it("adds prompt metadata only to generation-create events", () => {
    const preparedEvents = prepareInternalTraceEvents({
      events: [
        {
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: "trace-123",
            name: "internal-trace",
          },
        },
        {
          type: "generation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: "generation-123",
            traceId: "trace-123",
            name: "ChatOpenAI",
          },
        },
        {
          type: "generation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: "generation-123",
            traceId: "trace-123",
          },
        },
      ],
      environment: LangfuseInternalTraceEnvironment.PromptExperiments,
      prompt: {
        name: "internal-prompt",
        version: 3,
      },
    });

    expect(preparedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "generation-create",
          body: expect.objectContaining({
            id: "generation-123",
            environment: LangfuseInternalTraceEnvironment.PromptExperiments,
            promptName: "internal-prompt",
            promptVersion: 3,
          }),
        }),
        expect.objectContaining({
          type: "generation-update",
          body: expect.not.objectContaining({
            promptName: "internal-prompt",
            promptVersion: 3,
          }),
        }),
        expect.objectContaining({
          type: "trace-create",
          body: expect.not.objectContaining({
            promptName: "internal-prompt",
            promptVersion: 3,
          }),
        }),
      ]),
    );
  });
});
