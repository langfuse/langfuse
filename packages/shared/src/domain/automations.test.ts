import { describe, it, expect } from "vitest";

import {
  AvailableWebhookApiSchema,
  TriggerEventSource,
  TriggerEventSourceSchema,
  TriggerInputSchema,
} from "./automations";

describe("TriggerEventSourceSchema", () => {
  it("accepts the prompt event source", () => {
    expect(TriggerEventSourceSchema.safeParse("prompt").success).toBe(true);
  });

  it("accepts the monitor event source", () => {
    expect(TriggerEventSourceSchema.safeParse("monitor").success).toBe(true);
  });

  it("rejects unknown event sources", () => {
    expect(TriggerEventSourceSchema.safeParse("bogus").success).toBe(false);
  });
});

describe("AvailableWebhookApiSchema", () => {
  it("accepts the prompt v1 entry", () => {
    expect(AvailableWebhookApiSchema.safeParse({ prompt: "v1" }).success).toBe(
      true,
    );
  });

  it("accepts the monitor v1 entry", () => {
    expect(AvailableWebhookApiSchema.safeParse({ monitor: "v1" }).success).toBe(
      true,
    );
  });

  it("rejects unknown event source keys", () => {
    expect(AvailableWebhookApiSchema.safeParse({ bogus: "v1" }).success).toBe(
      false,
    );
  });
});

describe("TriggerInputSchema", () => {
  it("parses a prompt variant with an empty filter", () => {
    const result = TriggerInputSchema.safeParse({
      eventSource: TriggerEventSource.Prompt,
      filter: [],
    });
    expect(result.success).toBe(true);
  });

  it("parses a monitor variant with an empty filter", () => {
    const result = TriggerInputSchema.safeParse({
      eventSource: TriggerEventSource.Monitor,
      filter: [],
    });
    expect(result.success).toBe(true);
  });

  it("defaults filter to [] when omitted", () => {
    const result = TriggerInputSchema.safeParse({
      eventSource: TriggerEventSource.Monitor,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filter).toEqual([]);
    }
  });

  it("rejects an unknown event source", () => {
    expect(
      TriggerInputSchema.safeParse({ eventSource: "bogus", filter: [] })
        .success,
    ).toBe(false);
  });
});
