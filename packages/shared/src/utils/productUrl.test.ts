import { describe, expect, it } from "vitest";
import { TableViewPresetTableName } from "../domain/table-view-presets";
import {
  buildCurrentPageSavedViewPermalink,
  buildExperimentPath,
  buildNotebookPath,
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

describe("buildNotebookPath", () => {
  it("links to the live notebook or document without a version", () => {
    expect(buildNotebookPath({ projectId: "p1", notebookId: "nb_1" })).toBe(
      "/project/p1/notebooks/nb_1",
    );
    expect(
      buildNotebookPath({
        projectId: "p1",
        notebookId: "nb_1",
        documentId: "detail_1",
      }),
    ).toBe("/project/p1/notebooks/nb_1/detail_1");
  });

  it("can pin the notebook or a document to a published version", () => {
    expect(
      buildNotebookPath({ projectId: "p1", notebookId: "nb_1", version: 2 }),
    ).toBe("/project/p1/notebooks/nb_1?version=2");
    expect(
      buildNotebookPath({
        projectId: "p/1",
        notebookId: "nb/1",
        documentId: "doc 1",
        version: 2,
      }),
    ).toBe("/project/p%2F1/notebooks/nb%2F1/doc%201?version=2");
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
