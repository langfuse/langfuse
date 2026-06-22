import { describe, expect, it } from "vitest";

import type { ColumnDefinition } from "@langfuse/shared";

import { planCommit } from "./commit";
import {
  columnIdOf,
  createFieldRegistryFromColumns,
  resolveField,
} from "./fields";
import { filterStateToQueryText } from "./filter-state-to-query";

const TEST_COLUMNS: ColumnDefinition[] = [
  {
    id: "status",
    name: "Status",
    type: "stringOptions",
    internal: "status",
    aliases: ["state"],
    options: [{ value: "ACTIVE" }],
  },
  {
    id: "tags",
    name: "Tags",
    type: "arrayOptions",
    internal: "tags",
    options: [{ value: "prod" }],
  },
  {
    id: "message",
    name: "Message",
    type: "string",
    internal: "message",
    nullable: true,
  },
  {
    id: "count",
    name: "Count",
    type: "number",
    internal: "count",
  },
  {
    id: "createdAt",
    name: "Created At",
    type: "datetime",
    internal: "created_at",
  },
  {
    id: "active",
    name: "Active",
    type: "boolean",
    internal: "active",
  },
  {
    id: "metadata",
    name: "Metadata",
    type: "stringObject",
    internal: "metadata",
  },
];

function testRegistry() {
  return createFieldRegistryFromColumns("test", TEST_COLUMNS, {
    hiddenFields: ["active"],
    fieldOverrides: {
      message: { suggestObservedValues: true },
    },
    suggestionFieldIds: ["status"],
  });
}

describe("createFieldRegistryFromColumns", () => {
  it("maps sidebar column definitions into search-bar fields", () => {
    const registry = testRegistry();
    const fields = new Map(registry.fields.map((field) => [field.id, field]));

    expect(fields.get("status")).toMatchObject({
      kind: "text",
      syncMode: "exactOption",
    });
    expect(fields.get("tags")).toMatchObject({
      kind: "text",
      syncMode: "arrayOption",
    });
    expect(fields.get("message")).toMatchObject({
      kind: "text",
      syncMode: "textSearch",
      nullable: true,
      suggestObservedValues: true,
    });
    expect(fields.get("count")).toMatchObject({
      kind: "number",
      syncMode: "textSearch",
    });
    expect(fields.get("createdAt")).toMatchObject({
      kind: "datetime",
      syncMode: "textSearch",
    });
    expect(fields.has("active")).toBe(false);
  });

  it("resolves aliases, metadata only when present, and no score paths by default", () => {
    const registry = testRegistry();

    expect(resolveField("state", registry)).toMatchObject({
      type: "field",
      field: { id: "status" },
    });
    expect(resolveField("metadata.region", registry)).toMatchObject({
      type: "metadata",
      key: "region",
    });
    expect(resolveField("scores.accuracy", registry)).toBeNull();
    expect(resolveField("active", registry)).toBeNull();
    expect(columnIdOf("State", registry)).toBe("status");
  });

  it("keeps column-derived registries filter-only unless free text is opted in", () => {
    const registry = testRegistry();
    const valid = planCommit("status:ACTIVE", { registry });

    expect(valid.status).toBe("committed");
    if (valid.status !== "committed") return;
    expect(valid.filters).toEqual([
      {
        type: "stringOptions",
        column: "status",
        operator: "any of",
        value: ["ACTIVE"],
      },
    ]);
    expect(valid.searchQuery).toBeNull();
    expect(valid.searchType).toEqual([]);

    const invalid = planCommit("bare text", { registry });
    expect(invalid.status).toBe("invalid");
    if (invalid.status !== "invalid") return;
    expect(invalid.diagnostics.map((d) => d.message).join("\n")).toContain(
      "Free text search is not available on this table",
    );
  });

  it("does not render a stale full-text query for filter-only registries", () => {
    const registry = testRegistry();

    expect(
      filterStateToQueryText([], {
        registry,
        searchQuery: "timeout",
        searchType: ["id", "content"],
      }).text,
    ).toBe("");
  });
});
