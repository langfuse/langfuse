import { describe, expect, it } from "vitest";

import { compile } from "./compile";
import { metadataAccess, walkMetadataAccess } from "./metadata";
import { buildMetadataAccessPlan } from "./metadataQuery";

const CTX = { projectId: "golden-project" };
const LOWERED =
  "e.metadata_values[indexOf(e.metadata_names, {metadataKey:String})]";

describe("condition 7b: metadata indexOf access", () => {
  it("lowers to subscript + indexOf + bound-param nodes, not a SQL string", () => {
    const access = metadataAccess("a");
    const walked = walkMetadataAccess(access);
    const kinds = walked.map((entry) => entry.kind);

    expect(kinds).toEqual([
      "metadata-access",
      "subscript",
      "column-ref",
      "index-of",
      "column-ref",
      "bound-param",
    ]);
    expect(access.subscript.index.needle).toEqual({
      kind: "bound-param",
      name: "metadataKey",
      clickHouseType: "String",
      value: "a",
    });
    expect(typeof access.subscript.array).toBe("object");
    expect(access.subscript.array.kind).toBe("column-ref");
  });

  it("compiles a projection and a WHERE filter to the lowered form", () => {
    const compiled = compile(
      buildMetadataAccessPlan({ key: "a", whereGt: 2 }),
      CTX,
    );
    expect(compiled.sql).toContain(`${LOWERED} AS metadata_a`);
    expect(compiled.sql).toContain(`${LOWERED} > {metadataCmp:Int64}`);
    expect(compiled.sql).toContain("FROM events_core AS e");
    expect(compiled.sql).toContain("project_id = {projectId:String}");
    expect(compiled.params).toMatchObject({
      projectId: CTX.projectId,
      metadataKey: "a",
      metadataCmp: 2,
    });
    expect(compiled.sql).not.toMatch(/metadata\["a"\]/);
  });

  it("compiles the same nodes in HAVING", () => {
    const compiled = compile(
      buildMetadataAccessPlan({ key: "a", havingGt: 2, select: true }),
      CTX,
    );
    expect(compiled.sql).toMatch(/GROUP BY span_id/i);
    expect(compiled.sql).toContain(`HAVING ${LOWERED} > {metadataCmp:Int64}`);
    expect(compiled.params.metadataKey).toBe("a");
  });
});
