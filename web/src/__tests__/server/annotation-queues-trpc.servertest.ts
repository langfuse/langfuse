import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type { Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";

type SessionUser = NonNullable<Session["user"]>;
type SessionFeatureFlags = SessionUser["featureFlags"];

const HOBBY_LIMIT_MESSAGE =
  /Maximum number of annotation queues reached on Hobby plan/;

async function prepare(plan: Plan = "cloud:hobby") {
  const setup = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      name: "Demo User",
      canCreateOrganizations: true,
      admin: false,
      organizations: [
        {
          id: setup.org.id,
          name: setup.org.name,
          role: "OWNER",
          plan,
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: setup.project.id,
              role: "ADMIN",
              name: setup.project.name,
              deletedAt: null,
              retentionDays: null,
              hasTraces: false,
              createdAt: new Date().toISOString(),
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        templateFlag: true,
        excludeClickhouseRead: false,
      } as SessionFeatureFlags,
    },
    environment: {} as Session["environment"],
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  const scoreConfig = await prisma.scoreConfig.create({
    data: {
      name: `score-${uuidv4().slice(0, 8)}`,
      projectId: setup.project.id,
      dataType: "NUMERIC",
    },
  });

  return { setup, caller, scoreConfig };
}

describe("annotationQueues.create trpc", () => {
  it("rejects a second queue on cloud:hobby", async () => {
    const { setup, caller, scoreConfig } = await prepare("cloud:hobby");

    await caller.annotationQueues.create({
      projectId: setup.project.id,
      name: "first-queue",
      scoreConfigIds: [scoreConfig.id],
    });

    await expect(
      caller.annotationQueues.create({
        projectId: setup.project.id,
        name: "second-queue",
        scoreConfigIds: [scoreConfig.id],
      }),
    ).rejects.toThrow(HOBBY_LIMIT_MESSAGE);

    const queueCount = await prisma.annotationQueue.count({
      where: { projectId: setup.project.id },
    });
    expect(queueCount).toBe(1);
  });

  it("does not admit more than one queue on cloud:hobby under concurrent requests", async () => {
    // Counting outside a transaction lets concurrent requests all observe
    // count = 0 and all insert, so the limit only holds if check+create is
    // serialized. Unique names bypass the (projectId, name) unique index.
    const { setup, caller, scoreConfig } = await prepare("cloud:hobby");

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        caller.annotationQueues.create({
          projectId: setup.project.id,
          name: `hobby-q-${i}`,
          scoreConfigIds: [scoreConfig.id],
        }),
      ),
    );

    const queueCount = await prisma.annotationQueue.count({
      where: { projectId: setup.project.id },
    });
    expect(queueCount).toBe(1);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(results.length - rejected.length).toBe(1);
    for (const result of rejected) {
      expect(String(result.reason)).toMatch(HOBBY_LIMIT_MESSAGE);
    }
  }, 25_000);

  it("allows more than one queue when the plan is not cloud:hobby", async () => {
    const { setup, caller, scoreConfig } = await prepare("cloud:pro");

    await caller.annotationQueues.create({
      projectId: setup.project.id,
      name: "pro-queue-1",
      scoreConfigIds: [scoreConfig.id],
    });
    await caller.annotationQueues.create({
      projectId: setup.project.id,
      name: "pro-queue-2",
      scoreConfigIds: [scoreConfig.id],
    });

    const queueCount = await prisma.annotationQueue.count({
      where: { projectId: setup.project.id },
    });
    expect(queueCount).toBe(2);
  });
});
