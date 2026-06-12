import { describe, expect, it } from "vitest";

import { greptimeInClause } from "./queryHelpers";

describe("greptimeInClause", () => {
  it("quotes the column segment for dotted refs", () => {
    const { sql, params } = greptimeInClause("s.data_type", ["NUMERIC"], "dt");

    expect(sql).toBe("s.`data_type` IN (:dt_0)");
    expect(params).toEqual({ dt_0: "NUMERIC" });
  });

  it("quotes bare refs", () => {
    const { sql } = greptimeInClause("project_id", ["p1"], "pid");

    expect(sql).toBe("`project_id` IN (:pid_0)");
  });
});
