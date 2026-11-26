import { describe, expect, it } from "vitest";
import { getLightweightDeleteModeOverride } from "./lightweightDelete";

describe("getLightweightDeleteModeOverride", () => {
  it("forces alter_update only for DELETE FROM on excluded tables", () => {
    const excluded = ["scores"];
    const alterUpdate = { lightweight_delete_mode: "alter_update" };

    expect(
      getLightweightDeleteModeOverride(
        `
    DELETE FROM scores
    WHERE project_id = {projectId: String};
  `,
        excluded,
      ),
    ).toEqual(alterUpdate);
    expect(
      getLightweightDeleteModeOverride(
        "delete from default.`scores` ON CLUSTER default WHERE 1",
        excluded,
      ),
    ).toEqual(alterUpdate);

    expect(
      getLightweightDeleteModeOverride(
        "DELETE FROM scores_v2 WHERE 1",
        excluded,
      ),
    ).toEqual({});
    expect(
      getLightweightDeleteModeOverride("DELETE FROM traces WHERE 1", excluded),
    ).toEqual({});
    expect(
      getLightweightDeleteModeOverride(
        "ALTER TABLE scores DELETE WHERE 1",
        excluded,
      ),
    ).toEqual({});
    expect(
      getLightweightDeleteModeOverride("DELETE FROM scores WHERE 1", []),
    ).toEqual({});
  });
});
