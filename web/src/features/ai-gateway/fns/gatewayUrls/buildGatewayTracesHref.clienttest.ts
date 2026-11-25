import { describe, expect, it } from "vitest";
import { decodeFiltersGeneric } from "@langfuse/shared";

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
});
