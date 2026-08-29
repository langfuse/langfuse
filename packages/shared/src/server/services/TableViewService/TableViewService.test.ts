import { describe, expect, it } from "vitest";
import { TableViewPresetTableName } from "../../../domain/table-view-presets";
import { InvalidRequestError } from "../../../errors";
import { TableViewService } from "./TableViewService";

describe("TableViewService.generatePermalink", () => {
  it("builds a list-page permalink for tables in the URL map", async () => {
    await expect(
      TableViewService.generatePermalink(
        "https://us.cloud.langfuse.com",
        "view_1",
        TableViewPresetTableName.Sessions,
        "proj_1",
      ),
    ).resolves.toBe(
      "https://us.cloud.langfuse.com/project/proj_1/sessions?viewId=view_1",
    );
  });

  it("rejects session-detail with InvalidRequestError instead of a 500", async () => {
    await expect(
      TableViewService.generatePermalink(
        "https://us.cloud.langfuse.com",
        "view_1",
        TableViewPresetTableName.SessionDetail,
        "proj_1",
      ),
    ).rejects.toThrow(InvalidRequestError);
  });

  it("rejects unknown system-preset ids with InvalidRequestError", async () => {
    await expect(
      TableViewService.generatePermalink(
        "https://us.cloud.langfuse.com",
        "__langfuse_with_io__",
        TableViewPresetTableName.SessionDetail,
        "proj_1",
      ),
    ).rejects.toThrow(InvalidRequestError);
  });
});
