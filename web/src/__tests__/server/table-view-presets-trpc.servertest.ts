/** @jest-environment node */

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { TableViewPresetTableName } from "@langfuse/shared";
import { prisma, type Prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { randomUUID } from "node:crypto";

const prepare = async () => {
  const { project, org } = await createOrgProjectAndApiKey();
  const session: Session = {
    expires: "1",
    user: {
      id: `table-view-user-${randomUUID()}`,
      canCreateOrganizations: true,
      name: "Table View Test User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              hasTraces: false,
              name: project.name,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        searchBar: false,
        excludeClickhouseRead: false,
        templateFlag: true,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return {
    caller: appRouter.createCaller({ ...ctx, prisma }),
    projectId: project.id,
  };
};

describe("table view presets tRPC", () => {
  it("deletes an already-deleted preset idempotently", async () => {
    const { caller, projectId } = await prepare();
    const preset = await prisma.tableViewPreset.create({
      data: {
        projectId,
        name: `view-${randomUUID()}`,
        tableName: TableViewPresetTableName.ObservationsEvents,
        createdBy: null,
        updatedBy: null,
        filters: [],
        columnOrder: [],
        columnVisibility: {},
        searchQuery: null,
        // Preserve the runtime value; Prisma's types only accept
        // Prisma.JsonNull/DbNull for nullable Json inputs.
        orderBy: null as unknown as Prisma.NullableJsonNullValueInput,
      },
    });
    await prisma.defaultView.create({
      data: {
        projectId,
        userId: null,
        viewName: TableViewPresetTableName.ObservationsEvents,
        viewId: preset.id,
      },
    });

    const input = {
      projectId,
      tableViewPresetsId: preset.id,
    };

    await expect(
      caller.TableViewPresets.delete(input),
    ).resolves.toBeUndefined();
    await expect(
      caller.TableViewPresets.delete(input),
    ).resolves.toBeUndefined();

    await expect(
      prisma.tableViewPreset.count({ where: { id: preset.id, projectId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.defaultView.count({ where: { viewId: preset.id, projectId } }),
    ).resolves.toBe(0);
  });

  it("preserves defaults for system preset ids", async () => {
    const { caller, projectId } = await prepare();
    const user = await prisma.user.create({
      data: { email: `system-default-${randomUUID()}@example.com` },
    });
    const systemPresetId = "__langfuse_errors_only";

    await prisma.defaultView.createMany({
      data: [
        {
          projectId,
          userId: null,
          viewName: TableViewPresetTableName.ObservationsEvents,
          viewId: systemPresetId,
        },
        {
          projectId,
          userId: user.id,
          viewName: TableViewPresetTableName.ObservationsEvents,
          viewId: systemPresetId,
        },
      ],
    });

    await expect(
      caller.TableViewPresets.delete({
        projectId,
        tableViewPresetsId: systemPresetId,
      }),
    ).resolves.toBeUndefined();

    await expect(
      prisma.defaultView.count({
        where: { projectId, viewId: systemPresetId },
      }),
    ).resolves.toBe(2);
  });

  it("cleans dangling defaults for a missing user preset", async () => {
    const { caller, projectId } = await prepare();
    const missingPresetId = `missing-preset-${randomUUID()}`;
    await prisma.defaultView.create({
      data: {
        projectId,
        userId: null,
        viewName: TableViewPresetTableName.ObservationsEvents,
        viewId: missingPresetId,
      },
    });

    await expect(
      caller.TableViewPresets.delete({
        projectId,
        tableViewPresetsId: missingPresetId,
      }),
    ).resolves.toBeUndefined();

    await expect(
      prisma.defaultView.count({
        where: { projectId, viewId: missingPresetId },
      }),
    ).resolves.toBe(0);
  });
});
