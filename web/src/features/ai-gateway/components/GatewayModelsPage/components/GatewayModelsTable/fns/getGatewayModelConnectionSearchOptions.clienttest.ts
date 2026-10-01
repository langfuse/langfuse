import { describe, expect, it } from "vitest";
import { GATEWAY_MODELS_FIELD_REGISTRY } from "@/src/features/ai-gateway/constants/modelsSearchRegistry";
import {
  filterStateToQueryText,
  planCommit,
  withFieldOptions,
} from "@/src/features/search-bar";
import { getGatewayModelConnectionSearchOptions } from "./getGatewayModelConnectionSearchOptions";

describe("getGatewayModelConnectionSearchOptions", () => {
  it("keeps duplicate credential names tied to their connection IDs", () => {
    const result = getGatewayModelConnectionSearchOptions(
      [
        { value: "connection-a", displayValue: "Production" },
        { value: "connection-b", displayValue: "Production" },
      ],
      [],
    );

    expect(result.observedValues).toEqual([
      "Production (connection-a)",
      "Production (connection-b)",
    ]);
    expect(
      result.connectionIdByDisplayValue.get("Production (connection-a)"),
    ).toBe("connection-a");
    expect(
      result.connectionIdByDisplayValue.get("Production (connection-b)"),
    ).toBe("connection-b");

    const registry = withFieldOptions(
      GATEWAY_MODELS_FIELD_REGISTRY,
      "connection",
      result.registryOptions,
    );
    const query = filterStateToQueryText(
      [
        {
          column: "connection",
          type: "arrayOptions",
          operator: "any of",
          value: ["connection-a"],
        },
      ],
      {},
      registry,
    ).text;
    const commit = planCommit(`${query} provider:OPENAI`, undefined, registry);

    expect(query).toBe('connection:"Production (connection-a)"');
    expect(commit).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "connection",
          value: ["Production (connection-a)"],
        },
        { column: "provider", value: ["OPENAI"] },
      ],
    });
    if (commit.status !== "committed") return;
    const connectionFilter = commit.filters.find(
      (filter) => filter.column === "connection",
    );
    expect(connectionFilter?.type).toBe("arrayOptions");
    if (connectionFilter?.type !== "arrayOptions") return;
    expect(
      result.connectionIdByDisplayValue.get(connectionFilter.value[0]!),
    ).toBe("connection-a");
  });

  it("keeps unavailable connection IDs valid", () => {
    const result = getGatewayModelConnectionSearchOptions(
      [{ value: "connection-a", displayValue: "Production" }],
      ["connection-missing"],
    );

    expect(result.registryOptions).toContainEqual({
      value: "connection-missing",
      displayValue: "connection-missing",
    });
    expect(result.connectionIdByDisplayValue.get("connection-missing")).toBe(
      "connection-missing",
    );

    const registry = withFieldOptions(
      GATEWAY_MODELS_FIELD_REGISTRY,
      "connection",
      result.registryOptions,
    );
    const query = filterStateToQueryText(
      [
        {
          column: "connection",
          type: "arrayOptions",
          operator: "any of",
          value: ["connection-missing"],
        },
      ],
      {},
      registry,
    ).text;

    expect(
      planCommit(`${query} provider:OPENAI`, undefined, registry).status,
    ).toBe("committed");
  });
});
