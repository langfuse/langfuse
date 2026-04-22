/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  DefaultViewService,
  TableViewService,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import {
  LangfuseConflictError,
  TableViewPresetTableName,
} from "@langfuse/shared";
const createTableViewPreset = async ({
  projectId,
  name = `view-${randomUUID()}`,
  tableName,
}: {
  projectId: string;
  name?: string;
  tableName: TableViewPresetTableName;
}) =>
  prisma.tableViewPreset.create({
    data: {
      projectId,
      name,
      tableName,
      createdBy: null,
      updatedBy: null,
      filters: [],
      columnOrder: [],
      columnVisibility: {},
      searchQuery: null,
      orderBy: null,
    },
  });

describe("table view namespace compatibility", () => {
  it("lists legacy observations presets for the events table", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const legacyPreset = await createTableViewPreset({
      projectId,
      tableName: TableViewPresetTableName.Observations,
    });

    const presets = await TableViewService.getTableViewPresetsByTableName(
      TableViewPresetTableName.ObservationsEvents,
      projectId,
    );

    expect(presets.map((preset) => preset.id)).toContain(legacyPreset.id);
  });

  it("deduplicates same-named events presets in favor of the canonical namespace", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const name = `shared-name-${randomUUID()}`;

    await createTableViewPreset({
      projectId,
      name,
      tableName: TableViewPresetTableName.Observations,
    });

    const canonicalPreset = await createTableViewPreset({
      projectId,
      name,
      tableName: TableViewPresetTableName.ObservationsEvents,
    });

    const presets = await TableViewService.getTableViewPresetsByTableName(
      TableViewPresetTableName.ObservationsEvents,
      projectId,
    );

    expect(presets.filter((preset) => preset.name === name)).toEqual([
      expect.objectContaining({
        id: canonicalPreset.id,
        name,
        tableName: TableViewPresetTableName.ObservationsEvents,
      }),
    ]);
  });

  it("resolves a legacy observations default for the events table", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    await prisma.defaultView.create({
      data: {
        projectId,
        userId: null,
        viewName: TableViewPresetTableName.Observations,
        viewId: `legacy-default-${randomUUID()}`,
      },
    });

    await expect(
      DefaultViewService.getResolvedDefault({
        projectId,
        viewName: TableViewPresetTableName.ObservationsEvents,
      }),
    ).resolves.toMatchObject({
      scope: "project",
    });
  });

  it("preserves a legacy observations default when setting a new events default", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const legacyViewId = `legacy-default-${randomUUID()}`;
    const newViewId = `new-default-${randomUUID()}`;

    await prisma.defaultView.create({
      data: {
        projectId,
        userId: null,
        viewName: TableViewPresetTableName.Observations,
        viewId: legacyViewId,
      },
    });

    await DefaultViewService.setAsDefault({
      projectId,
      viewId: newViewId,
      viewName: TableViewPresetTableName.ObservationsEvents,
      scope: "project",
    });

    const defaults = await prisma.defaultView.findMany({
      where: { projectId },
      orderBy: { viewName: "asc" },
    });

    expect(defaults).toHaveLength(2);
    expect(defaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          viewName: TableViewPresetTableName.Observations,
          viewId: legacyViewId,
        }),
        expect.objectContaining({
          viewName: TableViewPresetTableName.ObservationsEvents,
          viewId: newViewId,
        }),
      ]),
    );
  });

  it("does not delete a legacy observations default when clearing an events default", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const legacyViewId = `legacy-default-${randomUUID()}`;

    await prisma.defaultView.createMany({
      data: [
        {
          projectId,
          userId: null,
          viewName: TableViewPresetTableName.Observations,
          viewId: legacyViewId,
        },
        {
          projectId,
          userId: null,
          viewName: TableViewPresetTableName.ObservationsEvents,
          viewId: `events-default-${randomUUID()}`,
        },
      ],
    });

    await DefaultViewService.clearDefault({
      projectId,
      viewName: TableViewPresetTableName.ObservationsEvents,
      scope: "project",
    });

    const defaults = await prisma.defaultView.findMany({
      where: { projectId },
    });

    expect(defaults).toHaveLength(1);
    expect(defaults[0]).toMatchObject({
      viewName: TableViewPresetTableName.Observations,
      viewId: legacyViewId,
    });
  });

  it("surfaces a conflict when updating a legacy preset into an existing events name", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const name = `shared-name-${randomUUID()}`;
    const legacyPreset = await createTableViewPreset({
      projectId,
      name,
      tableName: TableViewPresetTableName.Observations,
    });

    await createTableViewPreset({
      projectId,
      name,
      tableName: TableViewPresetTableName.ObservationsEvents,
    });

    await expect(
      TableViewService.updateTableViewPresets(
        {
          id: legacyPreset.id,
          projectId,
          name,
          tableName: TableViewPresetTableName.ObservationsEvents,
          filters: [],
          columnOrder: [],
          columnVisibility: {},
          searchQuery: "",
          orderBy: null,
        },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(LangfuseConflictError);
  });

  it("surfaces a conflict when renaming a legacy preset into an existing events name", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const name = `shared-name-${randomUUID()}`;
    const legacyPreset = await createTableViewPreset({
      projectId,
      name,
      tableName: TableViewPresetTableName.Observations,
    });

    await createTableViewPreset({
      projectId,
      name,
      tableName: TableViewPresetTableName.ObservationsEvents,
    });

    await expect(
      TableViewService.updateTableViewPresetsName(
        {
          id: legacyPreset.id,
          projectId,
          name,
          tableName: TableViewPresetTableName.ObservationsEvents,
        },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(LangfuseConflictError);
  });
});
