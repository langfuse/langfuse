import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock("@/src/server/api/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.create();
  return { createTRPCRouter: t.router, protectedProjectProcedure: t.procedure };
});
vi.mock("@/src/features/rbac", () => ({
  throwIfNoProjectAccess: mocks.access,
}));
vi.mock("@langfuse/shared/src/server/clickhouse", () => ({
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: async () => {} }),
  },
}));

import { sessionViewsRouter } from "@/src/server/api/routers/sessionViews";

const filters = [
  {
    column: "rootName",
    type: "string" as const,
    operator: "=" as const,
    value: "agent",
  },
];
const caller = sessionViewsRouter.createCaller({
  session: null,
  prisma: {
    sessionView: {
      findMany: mocks.findMany,
      create: mocks.create,
      updateMany: mocks.updateMany,
      deleteMany: mocks.deleteMany,
    },
  },
} as never);

describe("session saved views", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.create.mockResolvedValue({ id: "view" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findMany.mockResolvedValue([{ id: "view", name: "Agents", filters }]);
  });

  it("lists typed filters within the requested project and checks read access", async () => {
    const result = await caller.list({ projectId: "project" });
    expect(result[0].filters).toEqual(filters);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { projectId: "project" },
      orderBy: { name: "asc" },
    });
    expect(mocks.access).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project",
        scope: "TableViewPresets:read",
      }),
    );
  });

  it("creates a filter-only view and trims its name", async () => {
    await caller.save({ projectId: "project", name: " Agents ", filters });
    expect(mocks.create).toHaveBeenCalledWith({
      data: { projectId: "project", name: "Agents", filters },
      select: { id: true },
    });
    expect(mocks.access).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "TableViewPresets:CUD" }),
    );
  });

  it("cannot update a view in another project", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      caller.save({ projectId: "other", id: "view", name: "Agents", filters }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "view", projectId: "other" },
      data: { name: "Agents", filters },
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("deletes only within the requested project", async () => {
    await caller.delete({ projectId: "project", id: "view" });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { projectId: "project", id: "view" },
    });
  });

  it("does not mutate storage when write access is denied", async () => {
    mocks.access.mockImplementation(() => {
      throw new TRPCError({ code: "FORBIDDEN" });
    });
    await expect(
      caller.save({ projectId: "project", name: "Agents", filters }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.delete({ projectId: "project", id: "view" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects legacy child-observation filters", async () => {
    await expect(
      caller.save({
        projectId: "project",
        name: "Legacy",
        filters: [
          { column: "name", type: "string", operator: "=", value: "child" },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
