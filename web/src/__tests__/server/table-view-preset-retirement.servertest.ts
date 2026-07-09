/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  DefaultViewService,
  getSystemTableViewPresets,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { TableViewPresetTableName } from "@langfuse/shared";

// System preset ids are part of the persisted contract: they live in
// bookmarked `?viewId=` URLs and in `default_views` rows (view_id has no FK
// on purpose). A catalog iteration may RENAME a preset — keeping its id so
// existing references resolve to the new content — or RETIRE an id entirely,
// in which case references must degrade gracefully (no default applied, no
// error), never surface a recurring failure to the user.

// Shipped in v3.206.0 and removed by the category-chips catalog iteration.
const RETIRED_ID = "__langfuse_trace_root_observations";

const createDefault = ({
  projectId,
  userId = null,
  viewId,
}: {
  projectId: string;
  userId?: string | null;
  viewId: string;
}) =>
  prisma.defaultView.create({
    data: {
      projectId,
      userId,
      viewName: TableViewPresetTableName.ObservationsEvents,
      viewId,
    },
  });

describe("system preset retirement", () => {
  it("keeps the shipped ids for presets whose meaning survived the iteration", () => {
    const ids = getSystemTableViewPresets(
      TableViewPresetTableName.ObservationsEvents,
    ).map((preset) => preset.id);

    // Shipped pre-chips (v3.206.0): "Errors Only" kept as-is;
    // "Generations Only" renamed to "Review output (generations)" with
    // identical filters — the id must stay so bookmarks/defaults keep working.
    expect(ids).toContain("__langfuse_errors_only");
    expect(ids).toContain("__langfuse_generations_only");
  });

  it("treats a project default pointing at a retired system preset as no default", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await createDefault({ projectId, viewId: RETIRED_ID });

    await expect(
      DefaultViewService.getResolvedDefault({
        projectId,
        viewName: TableViewPresetTableName.ObservationsEvents,
      }),
    ).resolves.toBeNull();
  });

  it("falls through a retired user default to a live project default", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const user = await prisma.user.create({
      data: { email: `retired-default-${randomUUID()}@example.com` },
    });
    await createDefault({ projectId, userId: user.id, viewId: RETIRED_ID });
    await createDefault({ projectId, viewId: "__langfuse_errors_only" });

    await expect(
      DefaultViewService.getResolvedDefault({
        projectId,
        viewName: TableViewPresetTableName.ObservationsEvents,
        userId: user.id,
      }),
    ).resolves.toMatchObject({
      viewId: "__langfuse_errors_only",
      scope: "project",
    });
  });

  it("still resolves a default pointing at a live system preset", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await createDefault({ projectId, viewId: "__langfuse_generations_only" });

    await expect(
      DefaultViewService.getResolvedDefault({
        projectId,
        viewName: TableViewPresetTableName.ObservationsEvents,
      }),
    ).resolves.toMatchObject({
      viewId: "__langfuse_generations_only",
      scope: "project",
    });
  });

  it("leaves user views out of the retirement check", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    // A dangling reference to a DELETED user view is not the retirement
    // path: getResolvedDefault must still return it (the client surfaces the
    // failure), because silently skipping it would mask real data loss.
    const danglingUserViewId = `deleted-user-view-${randomUUID()}`;
    await createDefault({ projectId, viewId: danglingUserViewId });

    await expect(
      DefaultViewService.getResolvedDefault({
        projectId,
        viewName: TableViewPresetTableName.ObservationsEvents,
      }),
    ).resolves.toMatchObject({ viewId: danglingUserViewId });
  });
});
