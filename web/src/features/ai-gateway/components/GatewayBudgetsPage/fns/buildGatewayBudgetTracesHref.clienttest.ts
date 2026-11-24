import { describe, expect, it } from "vitest";
import { decodeFiltersGeneric } from "@langfuse/shared";

import { buildGatewayBudgetTracesHref } from "./buildGatewayBudgetTracesHref";

describe("buildGatewayBudgetTracesHref", () => {
  it("builds a traces URL filtered by gateway key owner user id for the users tab", () => {
    const href = buildGatewayBudgetTracesHref({
      projectId: "proj-1",
      tab: "users",
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

  it("builds a traces URL filtered by gateway API key id for the apiKeys tab", () => {
    const href = buildGatewayBudgetTracesHref({
      projectId: "proj/1",
      tab: "apiKeys",
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
