import { describe, expect, it } from "vitest";
import {
  MAX_METADATA_COLUMNS,
  getMetadataColumnId,
  getMetadataColumnVisibility,
  getMetadataValue,
  mergeMetadataColumnOrder,
  parseMetadataColumnConfigs,
  parseMetadataRecord,
  stripMetadataColumnsFromView,
  updateMetadataColumnOrder,
  updateMetadataColumnVisibility,
  type MetadataColumnConfig,
} from "./metadata-columns";

const column = (
  key: string,
  position: number,
  visible = true,
): MetadataColumnConfig => ({ key, position, visible });

describe("metadata column layout", () => {
  it("keeps literal dotted and reserved keys distinct from static columns", () => {
    expect(getMetadataColumnId("name")).not.toBe("name");
    expect(getMetadataColumnId("a.b")).not.toBe(getMetadataColumnId("a_b"));
    expect(getMetadataColumnId("__proto__")).not.toBe("__proto__");
  });

  it("produces IDs accepted by the table's column width CSS protocol", () => {
    for (const key of ["repo", "a.b", "a:b/%", " spaced ", "中文", "🚀"]) {
      const id = getMetadataColumnId(key);
      // DataTable uses this contract to choose a resizable CSS width instead
      // of falling back to a fixed 150px header.
      expect(id).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
      expect(`--header-${id}-size`).toMatch(/^--[a-zA-Z][a-zA-Z0-9_-]*$/);
      expect(`--col-${id}-size`).toMatch(/^--[a-zA-Z][a-zA-Z0-9_-]*$/);
    }
  });

  it("encodes Unicode and ambiguous code unit boundaries without collisions", () => {
    const keys = [
      "a.b",
      "a_b",
      "a-b",
      "a%2Eb",
      "a:b/%",
      "A",
      "a",
      "中文",
      "🚀",
      "é",
      "e\u0301",
      "\u0001\u0023",
      "\u0012\u0003",
      "metadata-key-0061",
    ];
    const ids = keys.map(getMetadataColumnId);
    expect(new Set(ids).size).toBe(keys.length);
    expect(keys.map(getMetadataColumnId)).toEqual(ids);
    expect(getMetadataColumnId("a:b/%")).toBe(
      "metadata-key-0061003a0062002f0025",
    );
    expect(getMetadataColumnId("🚀")).toBe("metadata-key-d83dde80");
  });

  it("merges absolute slots stably, preserving unknown static IDs and hidden columns", () => {
    const configs = [
      column("repo", 1),
      column("branch", 1, false),
      column("host", 99),
    ];
    expect(
      mergeMetadataColumnOrder(["name", "future-static", "cost"], configs),
    ).toEqual([
      "name",
      getMetadataColumnId("repo"),
      getMetadataColumnId("branch"),
      "future-static",
      "cost",
      getMetadataColumnId("host"),
    ]);
    expect(
      getMetadataColumnVisibility(configs)[getMetadataColumnId("branch")],
    ).toBe(false);
  });

  it("round-trips drag order and preserves local slots when a view changes base order", () => {
    const configs = [column("repo", 1), column("host", 5)];
    const dragged = [
      getMetadataColumnId("host"),
      "cost",
      getMetadataColumnId("repo"),
      "name",
    ];
    const updated = updateMetadataColumnOrder(configs, dragged);
    expect(mergeMetadataColumnOrder(["cost", "name"], updated)).toEqual(
      dragged,
    );
    expect(mergeMetadataColumnOrder(["name", "cost"], updated)).toEqual([
      getMetadataColumnId("host"),
      "name",
      getMetadataColumnId("repo"),
      "cost",
    ]);
    expect(configs[0].position).toBe(1);
  });

  it("updates only supplied dynamic visibility and keeps absent definitions intact", () => {
    const configs = [column("repo", 1), column("host", 5, false)];
    expect(
      updateMetadataColumnVisibility(configs, {
        [getMetadataColumnId("repo")]: false,
        name: false,
      }),
    ).toEqual([column("repo", 1, false), column("host", 5, false)]);
    expect(updateMetadataColumnOrder(configs, ["name"])).toEqual(configs);
  });

  it("strips local columns from shared layouts while preserving metadata filters", () => {
    const filters = [{ column: "metadata", key: "repo", value: "example" }];
    const state = {
      filters,
      columnOrder: ["name", getMetadataColumnId("repo"), "future-static"],
      columnVisibility: { name: true, [getMetadataColumnId("repo")]: false },
      searchQuery: "agent",
    };
    expect(stripMetadataColumnsFromView(state)).toEqual({
      ...state,
      columnOrder: ["name", "future-static"],
      columnVisibility: { name: true },
    });
    expect(stripMetadataColumnsFromView(state).filters).toBe(filters);
    expect(state.columnOrder).toHaveLength(3);
  });
});

describe("metadata column data boundaries", () => {
  it("rejects corrupt definitions, duplicate keys and malformed UTF-16 without trimming keys", () => {
    expect(
      parseMetadataColumnConfigs([
        null,
        [],
        "repo",
        { key: "" },
        { ...column("repo", 0), label: " Repository " },
        column("repo", 2),
        column(" spaced ", 3),
        { ...column("blank-label", 4), label: "   " },
        column("negative", -1),
        column("fractional", 1.5),
        { ...column("invalid-visible", 1), visible: "true" },
        column("\ud800", 1),
        column("\udc00", 1),
        column("invalid\ud800key", 1),
      ]),
    ).toEqual([
      { ...column("repo", 0), label: " Repository " },
      column(" spaced ", 3),
      column("blank-label", 4),
    ]);
    expect(parseMetadataColumnConfigs({ key: "repo" })).toEqual([]);
    expect(
      parseMetadataColumnConfigs(
        Array.from({ length: MAX_METADATA_COLUMNS + 5 }, (_, i) =>
          column(`key-${i}`, i),
        ),
      ),
    ).toHaveLength(MAX_METADATA_COLUMNS);
  });

  it("keeps valid Unicode and dotted keys unchanged for metadata access and filters", () => {
    const keys = ["中文", "🚀", "é", "e\u0301", "a.b"];
    expect(
      parseMetadataColumnConfigs(keys.map((key) => column(key, 0))),
    ).toEqual(keys.map((key) => column(key, 0)));
    const record = Object.fromEntries(keys.map((key, index) => [key, index]));
    for (const [index, key] of keys.entries()) {
      expect(getMetadataValue(record, key)).toBe(index);
    }
  });

  it("reads only own top-level keys and preserves every falsy value", () => {
    const record = parseMetadataRecord(
      '{"a.b":"literal","a":{"b":"nested"},"zero":0,"false":false,"empty":"","null":null,"__proto__":"safe"}',
    );
    expect(getMetadataValue(record, "a.b")).toBe("literal");
    expect(getMetadataValue(record, "zero")).toBe(0);
    expect(getMetadataValue(record, "false")).toBe(false);
    expect(getMetadataValue(record, "empty")).toBe("");
    expect(getMetadataValue(record, "null")).toBeNull();
    expect(getMetadataValue(record, "__proto__")).toBe("safe");
    expect(getMetadataValue(record, "toString")).toBeUndefined();
    expect(getMetadataValue(record, "missing")).toBeUndefined();
  });

  it.each([undefined, null, "{bad", "null", "[]", "3", [], false])(
    "treats unusable metadata %j as absent",
    (value) => expect(parseMetadataRecord(value)).toBeNull(),
  );
});
