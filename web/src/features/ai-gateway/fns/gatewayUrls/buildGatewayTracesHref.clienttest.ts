import { describe, expect, it } from "vitest";
import { decodeFiltersGeneric } from "@langfuse/shared";

import { GATEWAY_GUARDRAIL_FLAGGED_DATE_RANGE } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { buildGatewayTracesHref } from "./buildGatewayTracesHref";

describe("buildGatewayTracesHref", () => {
  it("builds a traces URL filtered by gateway key owner user id for a user subject", () => {
    const href = buildGatewayTracesHref({
      projectId: "proj-1",
      subject: "user",
      subjectId: "user-123",
    });
    const url = new URL(href, "http://localhost");

    expect(url.pathname).toBe("/project/proj-1/traces");
    expect(url.searchParams.get("dateRange")).toBeNull();
    expect(decodeFiltersGeneric(url.searchParams.get("filter") ?? "")).toEqual([
      {
        column: "metadata",
        type: "stringObject",
        key: "langfuse.gateway.api_key.owner.user_id",
        operator: "=",
        value: "user-123",
      },
    ]);
  });

  it("builds a traces URL filtered by gateway API key id for a key subject", () => {
    const href = buildGatewayTracesHref({
      projectId: "proj/1",
      subject: "key",
      subjectId: "key;456,789",
    });
    const url = new URL(href, "http://localhost");

    expect(url.pathname).toBe("/project/proj%2F1/traces");
    expect(decodeFiltersGeneric(url.searchParams.get("filter") ?? "")).toEqual([
      {
        column: "metadata",
        type: "stringObject",
        key: "langfuse.gateway.api_key.id",
        operator: "=",
        value: "key;456,789",
      },
    ]);
  });

  it("builds a 7-day traces URL filtered by guardrail metadata key presence", () => {
    const href = buildGatewayTracesHref({
      projectId: "proj-1",
      subject: "guardrail",
      subjectId: "gr-123",
      dateRange: GATEWAY_GUARDRAIL_FLAGGED_DATE_RANGE,
    });
    const url = new URL(href, "http://localhost");

    expect(url.pathname).toBe("/project/proj-1/traces");
    expect(url.searchParams.get("dateRange")).toBe("7d");
    expect(decodeFiltersGeneric(url.searchParams.get("filter") ?? "")).toEqual([
      {
        column: "metadata",
        type: "stringObject",
        key: "langfuse.gateway.guardrails.gr-123",
        operator: "is set",
        value: "",
      },
    ]);
  });

  it("targets observations when requested for legacy read paths", () => {
    const href = buildGatewayTracesHref({
      projectId: "proj-1",
      subject: "guardrail",
      subjectId: "gr-123",
      dateRange: GATEWAY_GUARDRAIL_FLAGGED_DATE_RANGE,
      target: "observations",
    });
    const url = new URL(href, "http://localhost");

    expect(url.pathname).toBe("/project/proj-1/observations");
    expect(url.searchParams.get("dateRange")).toBe("7d");
  });
});
