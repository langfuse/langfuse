import { randomUUID } from "node:crypto";

import { modelRouter } from "@/src/server/api/routers/models";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { Role } from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";

const modelNameConstraintTarget = [
  "project_id",
  "model_name",
  "start_date",
  "unit",
];

const createCaller = ({
  uniqueConstraintTarget = modelNameConstraintTarget,
}: {
  uniqueConstraintTarget?: string[];
} = {}) => {
  const orgId = randomUUID();
  const projectId = randomUUID();
  const session: Session = {
    expires: "1",
    user: {
      id: randomUUID(),
      name: "Models Router Test User",
      canCreateOrganizations: true,
      organizations: [
        {
          id: orgId,
          name: "Models Router Test Organization",
          role: Role.OWNER,
          plan: "cloud:pro",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: projectId,
              name: "Models Router Test Project",
              role: Role.OWNER,
              retentionDays: 0,
              deletedAt: null,
              hasTraces: false,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
        searchBar: false,
      },
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "oss",
    },
  };

  const transactionClient = {
    model: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
          meta: {
            target: uniqueConstraintTarget,
          },
        }),
      ),
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ matches: true }]),
    $transaction: vi.fn(
      async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  } as unknown as typeof ctx.prisma;

  return {
    caller: modelRouter.createCaller({ ...ctx, prisma }),
    projectId,
  };
};

describe("modelRouter.upsert", () => {
  it("returns BAD_REQUEST when a concurrent create hits the model name constraint", async () => {
    const { caller, projectId } = createCaller();
    const modelName = `concurrent-model-${randomUUID()}`;

    await expect(
      caller.upsert({
        modelId: null,
        projectId,
        modelName,
        matchPattern: `^${modelName}$`,
        pricingTiers: [
          {
            name: "Standard",
            isDefault: true,
            priority: 0,
            conditions: [],
            prices: { input: 1 },
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `Model name '${modelName}' already exists in project`,
    });
  });

  it("does not report a model name conflict for a primary key collision", async () => {
    const { caller, projectId } = createCaller({
      uniqueConstraintTarget: ["id"],
    });
    const modelName = `primary-key-race-${randomUUID()}`;

    await expect(
      caller.upsert({
        modelId: randomUUID(),
        projectId,
        modelName,
        matchPattern: `^${modelName}$`,
        pricingTiers: [
          {
            name: "Standard",
            isDefault: true,
            priority: 0,
            conditions: [],
            prices: { input: 1 },
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
