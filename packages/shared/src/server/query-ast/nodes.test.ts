import { describe, expect, it } from "vitest";

import { table } from "./db";
import { findNodesByKind, walkSelectNode } from "./walk";

describe("hypequery CH-native nodes", () => {
  it("ARRAY JOIN is a walkable kind-tagged node, not a raw SQL string", () => {
    const node = table("events_core")
      .select(["tags"])
      .arrayJoin("tags")
      .getQueryNode();

    const arrayJoins = findNodesByKind(node, "array-join");
    expect(arrayJoins).toHaveLength(1);
    expect(arrayJoins[0]?.node).toEqual({
      kind: "array-join",
      type: "ARRAY",
      expression: "tags",
    });
    expect(
      typeof (arrayJoins[0]?.node as { expression: unknown }).expression,
    ).toBe("string");
    expect(
      walkSelectNode(node).some((entry) => entry.kind === "array-join"),
    ).toBe(true);
  });

  it("LIMIT BY is a walkable kind-tagged node, not a raw SQL string", () => {
    const node = table("events_core")
      .select(["span_id", "project_id"])
      .orderBy("start_time", "DESC")
      .limitBy(1, ["span_id", "project_id"])
      .getQueryNode();

    const limitBy = findNodesByKind(node, "limit-by");
    expect(limitBy).toHaveLength(1);
    expect(limitBy[0]?.node).toEqual({
      kind: "limit-by",
      limit: 1,
      by: ["span_id", "project_id"],
    });
  });

  it("PREWHERE and WITH TOTALS are node fields, not concatenated SQL", () => {
    const prewhereNode = table("events_core")
      .select(["span_id"])
      .prewhere("is_deleted", "eq", 0)
      .getQueryNode();
    expect(prewhereNode.prewhere?.kind).toBe("condition");

    const totalsNode = table("events_core")
      .select(["environment"])
      .count("span_id", "spans")
      .groupBy("environment")
      .withTotals()
      .getQueryNode();
    expect(totalsNode.withTotals).toBe(true);
    expect(totalsNode.groupBy?.[0]).toEqual({
      kind: "group-by-item",
      expression: "environment",
    });
  });
});

describe("hypequery node-set gaps", () => {
  it("has no window-function / OVER helper on the builder", () => {
    const builder = table("events_core").select(["span_id"]);
    expect("over" in builder).toBe(false);
    expect("window" in builder).toBe(false);
    expect("rowNumber" in builder).toBe(false);
  });

  it("has no keyset-cursor helper", () => {
    const builder = table("events_core").select(["span_id"]);
    expect("keyset" in builder).toBe(false);
    expect("afterCursor" in builder).toBe(false);
  });

  it("IN-subquery is a string operand, not a nested query node", () => {
    const node = table("events_core")
      .select(["span_id"])
      .where("trace_id", "inSubquery", "SELECT trace_id FROM traces")
      .getQueryNode();
    expect(node.where).toMatchObject({
      kind: "condition",
      operator: "inSubquery",
      value: "SELECT trace_id FROM traces",
    });
  });

  it("does not expose a public transformer / plugin registration API", () => {
    const builder = table("events_core").select(["span_id"]);
    expect("transform" in builder).toBe(false);
    expect("withPlugin" in builder).toBe(false);
    expect("withTransform" in builder).toBe(false);
    // queryTransforms is a private class field (enumerable on the instance) but
    // not a registration method — there is no public way to push a pass.
    expect(
      typeof (builder as unknown as { queryTransforms?: unknown })
        .queryTransforms,
    ).not.toBe("function");
  });
});
