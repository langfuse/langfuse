/** @jest-environment node */

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { TableViewPresetTableName } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
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
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
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
        orderBy: null,
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

    await expect(caller.TableViewPresets.delete(input)).resolves.toEqual({
      success: true,
    });
    await expect(caller.TableViewPresets.delete(input)).resolves.toEqual({
      success: true,
    });

    await expect(
      prisma.tableViewPreset.count({ where: { id: preset.id, projectId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.defaultView.count({ where: { viewId: preset.id, projectId } }),
    ).resolves.toBe(0);
  });
});
