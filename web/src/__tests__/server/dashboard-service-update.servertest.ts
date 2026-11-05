import { vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  createOrgProjectAndApiKey,
  DashboardService,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { LangfuseNotFoundError } from "@langfuse/shared";

describe("DashboardService update methods", () => {
  it("reads future placements without breaking the project list and preserves their raw payload when updating a known layout", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const { projectId: otherProjectId } = await createOrgProjectAndApiKey();
    const known = {
      type: "preset" as const,
      id: "known",
      presetId: "known-preset",
      x: 0,
      y: 0,
      x_size: 6,
      y_size: 10,
    };
    const future = {
      type: "future-placement",
      id: "future",
      x: 6,
      y: 0,
      x_size: 6,
      y_size: 10,
      payload: {
        version: 2,
        nested: [null, false, { label: "Synthetic content" }],
      },
      extra: "retained exactly",
    };
    const dashboard = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Compatibility fixture",
        description: "",
        definition: { widgets: [known, future] },
      },
    });

    const listed = await DashboardService.listDashboards({
      projectId,
      includeLangfuseOwned: false,
    });
    expect(
      listed.dashboards.find(({ id }) => id === dashboard.id)?.definition
        .widgets,
    ).toEqual([known]);
    expect(
      (await DashboardService.getDashboard(dashboard.id, projectId))?.definition
        .widgets,
    ).toEqual([known]);

    const moved = { ...known, y: 20 };
    const result = await DashboardService.updateDashboardDefinition(
      dashboard.id,
      projectId,
      { widgets: [moved] },
    );
    expect(result.definition.widgets).toEqual([moved]);
    const persisted = await prisma.dashboard.findUniqueOrThrow({
      where: { id: dashboard.id, projectId },
    });
    expect(persisted.definition).toEqual({ widgets: [moved, future] });

    // A server-known placement omitted by an older client's capabilities is retained too.
    await DashboardService.updateDashboardDefinition(
      dashboard.id,
      projectId,
      { widgets: [] },
      undefined,
      ["widget"],
    );
    expect(
      (
        await prisma.dashboard.findUniqueOrThrow({
          where: { id: dashboard.id, projectId },
        })
      ).definition,
    ).toEqual({ widgets: [moved, future] });

    const copy = await DashboardService.cloneDashboard(
      dashboard.id,
      projectId,
      "Compatibility copy",
    );
    expect(
      (
        await prisma.dashboard.findUniqueOrThrow({
          where: { id: copy.id, projectId },
        })
      ).definition,
    ).toEqual({ widgets: [moved, future] });
    const editedCopy = await DashboardService.cloneDashboard(
      dashboard.id,
      projectId,
      "Edited compatibility copy",
      undefined,
      { widgets: [] },
      ["widget"],
    );
    expect(
      (
        await prisma.dashboard.findUniqueOrThrow({
          where: { id: editedCopy.id, projectId },
        })
      ).definition,
    ).toEqual({ widgets: [moved, future] });

    await expect(
      DashboardService.updateDashboardDefinition(dashboard.id, otherProjectId, {
        widgets: [],
      }),
    ).rejects.toThrow(LangfuseNotFoundError);
    expect(
      (
        await prisma.dashboard.findUniqueOrThrow({
          where: { id: dashboard.id, projectId },
        })
      ).definition,
    ).toEqual(persisted.definition);

    // Existing cross-type ids must round-trip; newly introduced collisions still reject.
    const sharedIdFuture = { ...future, id: moved.id };
    await prisma.dashboard.update({
      where: { id: dashboard.id, projectId },
      data: { definition: { widgets: [moved, sharedIdFuture, future] } },
    });
    await DashboardService.updateDashboardDefinition(dashboard.id, projectId, {
      widgets: [moved],
    });
    const sharedIdCopy = await DashboardService.cloneDashboard(
      dashboard.id,
      projectId,
      "Shared id copy",
      undefined,
      { widgets: [moved] },
    );
    expect(
      (
        await prisma.dashboard.findUniqueOrThrow({
          where: { id: sharedIdCopy.id, projectId },
        })
      ).definition,
    ).toEqual({ widgets: [moved, sharedIdFuture, future] });
    await expect(
      DashboardService.updateDashboardDefinition(dashboard.id, projectId, {
        widgets: [{ ...moved, id: future.id }],
      }),
    ).rejects.toThrow("Placement id belongs to an unsupported placement type");

    // Explicit capability allows intentional removal of a supported placement.
    await DashboardService.updateDashboardDefinition(
      dashboard.id,
      projectId,
      { widgets: [] },
      undefined,
      ["preset"],
    );
    expect(
      (
        await prisma.dashboard.findUniqueOrThrow({
          where: { id: dashboard.id, projectId },
        })
      ).definition,
    ).toEqual({ widgets: [sharedIdFuture, future] });
  });

  it("retains the latest unsupported payload after waiting for a concurrent writer", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const initial = {
      type: "future-placement",
      id: "future",
      payload: { revision: 1 },
    };
    const latest = {
      ...initial,
      payload: { revision: 2, extra: ["preserve"] },
    };
    const dashboard = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Concurrent compatibility fixture",
        description: "",
        definition: { widgets: [initial] },
      },
    });
    let lockAcquired!: (pid: number) => void;
    const locked = new Promise<number>((resolve) => {
      lockAcquired = resolve;
    });
    let releaseWriter!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const writer = prisma.$transaction(async (tx) => {
      await tx.dashboard.update({
        where: { id: dashboard.id, projectId },
        data: { definition: { widgets: [latest] } },
      });
      const [{ pid }] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      lockAcquired(pid);
      await release;
    });
    const writerPid = await locked;
    const save = DashboardService.updateDashboardDefinition(
      dashboard.id,
      projectId,
      { widgets: [] },
    );
    try {
      // Observe actual lock contention, rather than racing the write with a timer.
      await vi.waitFor(
        async () => {
          const [{ blocked }] = await prisma.$queryRaw<{ blocked: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE ${writerPid} = ANY(pg_blocking_pids(pid))
          ) AS blocked
        `;
          expect(blocked).toBe(true);
        },
        { timeout: 3000 },
      );
    } finally {
      releaseWriter();
      await writer;
      await save;
    }
    expect(
      (
        await prisma.dashboard.findUniqueOrThrow({
          where: { id: dashboard.id, projectId },
        })
      ).definition,
    ).toEqual({ widgets: [latest] });
  });

  it("throw LangfuseNotFoundError instead of P2025 for a missing dashboard", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const missingId = uuidv4();

    await expect(
      DashboardService.updateDashboardDefinition(missingId, projectId, {
        widgets: [],
      }),
    ).rejects.toThrow(LangfuseNotFoundError);

    await expect(
      DashboardService.updateDashboard(missingId, projectId, "name", ""),
    ).rejects.toThrow(LangfuseNotFoundError);

    await expect(
      DashboardService.updateDashboardFilters(missingId, projectId, []),
    ).rejects.toThrow(LangfuseNotFoundError);
  });
});
