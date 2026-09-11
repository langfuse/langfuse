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
  const userId = `table-view-user-${randomUUID()}`;
  const session: Session = {
    expires: "1",
    user: {
      id: userId,
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
    userId,
  };
};

describe("table view presets tRPC", () => {
  it("creates separate saved views for evaluator and rule tables", async () => {
    const { caller, projectId, userId } = await prepare();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com` },
    });
    const [evaluatorView, ruleView] = await Promise.all([
      caller.TableViewPresets.create({
        projectId,
        name: `evaluator-view-${randomUUID()}`,
        tableName: TableViewPresetTableName.Evaluators,
        filters: [
          {
            column: "status",
            type: "stringOptions",
            operator: "any of",
            value: ["ACTIVE"],
          },
        ],
        columnOrder: ["name", "status"],
        columnVisibility: { name: true, status: true },
        searchQuery: "quality",
        orderBy: null,
      }),
      caller.TableViewPresets.create({
        projectId,
        name: `rule-view-${randomUUID()}`,
        tableName: TableViewPresetTableName.EvaluationRules,
        filters: [
          {
            column: "enabled",
            type: "boolean",
            operator: "=",
            value: true,
          },
        ],
        columnOrder: ["name", "enabled"],
        columnVisibility: { name: true, enabled: true },
        orderBy: null,
      }),
    ]);

    await expect(
      caller.TableViewPresets.getByTableName({
        projectId,
        tableName: TableViewPresetTableName.Evaluators,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: evaluatorView.view.id,
        tableName: TableViewPresetTableName.Evaluators,
        searchQuery: "quality",
      }),
    ]);
    await expect(
      caller.TableViewPresets.getByTableName({
        projectId,
        tableName: TableViewPresetTableName.EvaluationRules,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: ruleView.view.id,
        tableName: TableViewPresetTableName.EvaluationRules,
      }),
    ]);
    await prisma.tableViewPreset.deleteMany({ where: { projectId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("round-trips search scopes through create, list, update, and a saved-view permalink", async () => {
    const { caller, projectId, userId } = await prepare();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com` },
    });
    try {
      const input = {
        projectId,
        name: `scoped-view-${randomUUID()}`,
        tableName: TableViewPresetTableName.Traces,
        filters: [],
        columnOrder: [],
        columnVisibility: {},
        searchQuery: "needle",
        orderBy: null,
      };
      const created = await caller.TableViewPresets.create({
        ...input,
        searchType: ["input"],
      });
      expect(created.view).toMatchObject({
        searchQuery: "needle",
        searchType: ["input"],
      });
      await expect(
        caller.TableViewPresets.getByTableName({
          projectId,
          tableName: TableViewPresetTableName.Traces,
        }),
      ).resolves.toContainEqual(
        expect.objectContaining({
          id: created.view.id,
          searchType: ["input"],
        }),
      );

      await caller.TableViewPresets.update({
        ...input,
        id: created.view.id,
        searchType: ["id", "output"],
      });
      // An older client updating another part of the view has no scope opinion.
      await caller.TableViewPresets.update({
        ...input,
        id: created.view.id,
        searchQuery: "updated needle",
      });
      const permalink = await caller.TableViewPresets.generatePermalink({
        projectId,
        viewId: created.view.id,
        tableName: TableViewPresetTableName.Traces,
        baseUrl: "https://cloud.example.test",
      });
      const viewId = new URL(permalink).searchParams.get("viewId");
      expect(viewId).toBe(created.view.id);
      await expect(
        caller.TableViewPresets.getById({
          projectId,
          viewId: viewId!,
        }),
      ).resolves.toMatchObject({
        searchQuery: "updated needle",
        searchType: ["id", "output"],
      });
    } finally {
      await prisma.tableViewPreset.deleteMany({ where: { projectId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });

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
