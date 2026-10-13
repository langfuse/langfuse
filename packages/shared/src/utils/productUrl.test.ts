import { describe, expect, it } from "vitest";
import { TableViewPresetTableName } from "../domain/table-view-presets";
import {
  buildCurrentPageSavedViewPermalink,
  buildExperimentPath,
  parseSavedViewFromURL,
  tableViewPresetPermalinkUsesCurrentPath,
} from "./productUrl";

describe("buildExperimentPath", () => {
  it("links a run to its items view", () => {
    expect(
      buildExperimentPath({
        projectId: "proj_1",
        experimentId: "exp_1",
      }),
    ).toBe("/project/proj_1/experiments/results?baseline=exp_1");
  });

  it("can pre-apply a shareable items filter", () => {
    expect(
      buildExperimentPath({
        projectId: "proj_1",
        experimentId: "exp_1",
        filters: [
          {
            column: "level",
            type: "stringOptions",
            operator: "any of",
            value: ["ERROR"],
          },
        ],
      }),
    ).toBe(
      "/project/proj_1/experiments/results?baseline=exp_1&filter=level%3BstringOptions%3B%3Bany+of%3BERROR",
    );
  });
});

describe("tableViewPresetPermalinkUsesCurrentPath", () => {
  it("is true only for session detail, which embeds a session id in the path", () => {
    expect(
      tableViewPresetPermalinkUsesCurrentPath(
        TableViewPresetTableName.SessionDetail,
      ),
    ).toBe(true);
    expect(
      tableViewPresetPermalinkUsesCurrentPath(
        TableViewPresetTableName.Sessions,
      ),
    ).toBe(false);
    expect(
      tableViewPresetPermalinkUsesCurrentPath(TableViewPresetTableName.Traces),
    ).toBe(false);
  });
});

describe("buildCurrentPageSavedViewPermalink", () => {
  it("keeps the session path and sets viewId, dropping other query/hash state", () => {
    const href = buildCurrentPageSavedViewPermalink({
      origin: "https://us.cloud.langfuse.com",
      pathname:
        "/project/proj_1/sessions/e2e_dt_sup_15%3A950e5c49-03b5-49c6-a602-a8d76119d343",
      viewId: "view_saved_1",
    });

    expect(href).toBe(
      "https://us.cloud.langfuse.com/project/proj_1/sessions/e2e_dt_sup_15%3A950e5c49-03b5-49c6-a602-a8d76119d343?viewId=view_saved_1",
    );
    expect(parseSavedViewFromURL(href, false)).toEqual({
      viewId: "view_saved_1",
      tableName: TableViewPresetTableName.SessionDetail,
    });
  });
});
