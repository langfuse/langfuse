import { createSession } from "@/src/__tests__/fixtures/session-factory";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  GetModelV1Response,
  GetModelsV1Response,
} from "@/src/features/public-api/types/models";
import {
  GetObservationV1Response,
  GetObservationsV1Response,
} from "@/src/features/public-api/types/observations";
import { GetTraceV1Response } from "@/src/features/public-api/types/traces";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import {
  createEvent,
  createEventsCh,
  createModelCache,
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  clearModelCacheForProject,
  findModel,
  getObservationsTableWithModelData,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type ModelOwner =
  | { scope: "LANGFUSE" }
  | { scope: "ORGANIZATION"; organizationId: string }
  | { scope: "PROJECT"; projectId: string };

const createModel = async (
  owner: ModelOwner,
  modelName: string,
  matchPattern: string,
  inputPrice: string,
) => {
  const id = v4();
  await prisma.model.create({
    data: {
      id,
      ...owner,
      modelName,
      matchPattern,
      unit: "TOKENS",
      pricingTiers: {
        create: {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: {
            create: { modelId: id, usageType: "input", price: inputPrice },
          },
        },
      },
    },
  });
  return id;
};

const createCaller = (
  orgId: string,
  projectId: string,
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" = "OWNER",
) => {
  const session = createSession({
    user: { id: `user-${v4()}`, name: "Org models test user" },
    organizations: [
      {
        id: orgId,
        name: orgId,
        role,
        plan: "cloud:team",
        projects: [
          {
            id: projectId,
            role: "ADMIN",
            name: projectId,
            hasTraces: true,
          },
        ],
      },
    ],
  });
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
};

/**
 * Two organizations: A owns project A1 (with its own override) and project A2
 * (without one); B owns project B1. Every read path must resolve project, then
 * organization, then Langfuse definitions, and never return another
 * organization's definitions.
 */
describe("organization model definitions", () => {
  const suffix = v4();
  const sharedName = `shared-${suffix}`;
  const orgOnlyName = `org-only-${suffix}`;
  const orgBName = `org-b-${suffix}`;
  const exact = (name: string) => `(?i)^(${name})$`;

  let orgA: Awaited<ReturnType<typeof createOrgProjectAndApiKey>>;
  let orgB: Awaited<ReturnType<typeof createOrgProjectAndApiKey>>;
  let projectA2Id: string;

  const ids = {
    langfuseShared: "",
    orgAShared: "",
    projectA1Shared: "",
    orgAOnly: "",
    orgBOnly: "",
  };

  beforeAll(async () => {
    orgA = await createOrgProjectAndApiKey();
    orgB = await createOrgProjectAndApiKey();
    projectA2Id = v4();
    await prisma.project.create({
      data: { id: projectA2Id, name: projectA2Id, orgId: orgA.orgId },
    });

    ids.langfuseShared = await createModel(
      { scope: "LANGFUSE" },
      sharedName,
      exact(sharedName),
      "0.003",
    );
    ids.orgAShared = await createModel(
      { scope: "ORGANIZATION", organizationId: orgA.orgId },
      sharedName,
      exact(sharedName),
      "0.002",
    );
    // A broader pattern than the organization's still wins: scope beats specificity.
    ids.projectA1Shared = await createModel(
      { scope: "PROJECT", projectId: orgA.projectId },
      sharedName,
      `(?i)^(shared-.*${suffix})$`,
      "0.001",
    );
    ids.orgAOnly = await createModel(
      { scope: "ORGANIZATION", organizationId: orgA.orgId },
      orgOnlyName,
      exact(orgOnlyName),
      "0.004",
    );
    ids.orgBOnly = await createModel(
      { scope: "ORGANIZATION", organizationId: orgB.orgId },
      orgBName,
      exact(orgBName),
      "0.005",
    );
  });

  afterAll(async () => {
    const projectIds = [orgA.projectId, projectA2Id, orgB.projectId];
    await prisma.model.deleteMany({
      where: { id: { in: Object.values(ids) } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.orgId, orgB.orgId] } },
    });
    await Promise.all(projectIds.map((id) => clearModelCacheForProject(id)));
  });

  describe("database constraints", () => {
    it("requires each scope's own owner column and unique names per organization", async () => {
      await expect(
        prisma.model.create({
          data: { scope: "ORGANIZATION", modelName: v4(), matchPattern: "x" },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.model.create({
          data: {
            scope: "ORGANIZATION",
            organizationId: orgA.orgId,
            projectId: orgA.projectId,
            modelName: v4(),
            matchPattern: "x",
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.model.create({
          data: {
            scope: "PROJECT",
            projectId: orgA.projectId,
            organizationId: orgA.orgId,
            modelName: v4(),
            matchPattern: "x",
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.model.create({
          data: {
            scope: "ORGANIZATION",
            organizationId: orgA.orgId,
            modelName: orgOnlyName,
            matchPattern: "x",
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("ingest resolution", () => {
    it("prefers project, then organization, then Langfuse definitions", async () => {
      const resolve = async (projectId: string, model: string) =>
        (await findModel({ projectId, model })).model?.id ?? null;

      expect(await resolve(orgA.projectId, sharedName)).toBe(
        ids.projectA1Shared,
      );
      expect(await resolve(projectA2Id, sharedName)).toBe(ids.orgAShared);
      expect(await resolve(orgB.projectId, sharedName)).toBe(
        ids.langfuseShared,
      );
      expect(await resolve(projectA2Id, orgOnlyName)).toBe(ids.orgAOnly);
    });

    it("never resolves another organization's definitions", async () => {
      const resolve = async (projectId: string, model: string) =>
        (await findModel({ projectId, model })).model?.id ?? null;

      expect(await resolve(orgB.projectId, orgOnlyName)).toBeNull();
      expect(await resolve(orgA.projectId, orgBName)).toBeNull();
      expect(await resolve(projectA2Id, orgBName)).toBeNull();
    });
  });

  describe("tRPC models router", () => {
    it("lists organization and Langfuse definitions of the same name separately", async () => {
      const caller = createCaller(orgA.orgId, projectA2Id);
      const { models } = await caller.models.getAll({
        projectId: projectA2Id,
        page: 0,
        limit: 100,
        searchString: suffix,
      });

      expect(models.map((m) => [m.id, m.scope]).sort()).toEqual(
        [
          [ids.langfuseShared, "LANGFUSE"],
          [ids.orgAShared, "ORGANIZATION"],
          [ids.orgAOnly, "ORGANIZATION"],
        ].sort(),
      );
    });

    it("reads own organization definitions but not another organization's", async () => {
      const caller = createCaller(orgA.orgId, projectA2Id);

      const own = await caller.models.getById({
        projectId: projectA2Id,
        modelId: ids.orgAOnly,
      });
      expect(own.scope).toBe("ORGANIZATION");

      await expect(
        caller.models.getById({
          projectId: projectA2Id,
          modelId: ids.orgBOnly,
        }),
      ).rejects.toThrow("Model not found");
    });

    it("marks definitions whose name a higher-precedence scope also defines", async () => {
      const caller = createCaller(orgA.orgId, orgA.projectId);
      const { models } = await caller.models.getAll({
        projectId: orgA.projectId,
        page: 0,
        limit: 100,
        searchString: suffix,
      });

      expect(
        Object.fromEntries(models.map((m) => [m.id, m.isOverridden])),
      ).toEqual({
        [ids.projectA1Shared]: false,
        [ids.orgAShared]: true,
        [ids.langfuseShared]: true,
        [ids.orgAOnly]: false,
      });
    });

    it("pages definitions across scopes with a stable total", async () => {
      const caller = createCaller(orgA.orgId, orgA.projectId);
      const getPage = (page: number, limit: number) =>
        caller.models.getAll({
          projectId: orgA.projectId,
          page,
          limit,
          searchString: suffix,
        });

      const all = await getPage(0, 100);
      const pages = await Promise.all([0, 1, 2].map((p) => getPage(p, 3)));

      expect(pages.map((p) => p.models.length)).toEqual([3, 1, 0]);
      expect(pages.map((p) => p.totalCount)).toEqual([4, 4, 4]);
      expect(pages.flatMap((p) => p.models.map((m) => m.id))).toEqual(
        all.models.map((m) => m.id),
      );
      expect(all.models.map((m) => m.id)).toEqual([
        ids.projectA1Shared,
        ids.orgAOnly,
        ids.orgAShared,
        ids.langfuseShared,
      ]);
    });
  });

  describe("tRPC organization models router", () => {
    it("lists the organization's own and Langfuse definitions, never project ones", async () => {
      const caller = createCaller(orgA.orgId, orgA.projectId, "ADMIN");
      const { models, totalCount } = await caller.organizationModels.getAll({
        orgId: orgA.orgId,
        page: 0,
        limit: 100,
        searchString: suffix,
      });

      expect(totalCount).toBe(3);
      expect(
        Object.fromEntries(models.map((m) => [m.id, m.isOverridden])),
      ).toEqual({
        [ids.orgAShared]: false,
        [ids.orgAOnly]: false,
        [ids.langfuseShared]: true,
      });
    });

    it("lets admins create, edit and delete definitions that apply to every project, with audit logs", async () => {
      const caller = createCaller(orgA.orgId, orgA.projectId, "ADMIN");
      const modelName = `org-crud-${suffix}`;
      const resolve = async () =>
        (await findModel({ projectId: projectA2Id, model: modelName })).model
          ?.id ?? null;
      const upsert = (modelId: string | null, input: string) =>
        caller.organizationModels.upsert({
          orgId: orgA.orgId,
          modelId,
          modelName,
          matchPattern: exact(modelName),
          pricingTiers: [
            {
              name: "Standard",
              isDefault: true,
              priority: 0,
              conditions: [],
              prices: { input: Number(input) },
            },
          ],
        });

      // Caches a miss, which the write must invalidate for every project.
      expect(await resolve()).toBeNull();

      const created = await upsert(null, "0.1");
      expect(created).toMatchObject({
        scope: "ORGANIZATION",
        organizationId: orgA.orgId,
        projectId: null,
      });
      expect(await resolve()).toBe(created.id);

      await upsert(created.id, "0.2");
      const match = await caller.organizationModels.testMatch({
        orgId: orgA.orgId,
        modelName,
      });
      expect(match.matched && match.matchedTier.prices).toEqual({
        input: 0.2,
      });

      await caller.organizationModels.delete({
        orgId: orgA.orgId,
        modelId: created.id,
      });
      expect(await resolve()).toBeNull();

      const logs = await prisma.auditLog.findMany({
        where: { resourceType: "model", resourceId: created.id },
      });
      expect(
        logs.map((log) => [log.action, log.orgId, log.projectId]).sort(),
      ).toEqual([
        ["create", orgA.orgId, null],
        ["delete", orgA.orgId, null],
        ["update", orgA.orgId, null],
      ]);
      const update = logs.find((log) => log.action === "update");
      expect(update?.before).toContain('"0.1"');
      expect(update?.after).toContain('"0.2"');
    });

    it("forbids members and viewers", async () => {
      const member = createCaller(orgA.orgId, orgA.projectId, "MEMBER");
      const viewer = createCaller(orgA.orgId, orgA.projectId, "VIEWER");

      await expect(
        member.organizationModels.getAll({
          orgId: orgA.orgId,
          page: 0,
          limit: 10,
          searchString: "",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        viewer.organizationModels.delete({
          orgId: orgA.orgId,
          modelId: ids.orgAOnly,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("treats definitions owned by anyone else as missing", async () => {
      const caller = createCaller(orgA.orgId, orgA.projectId, "OWNER");
      const orgId = orgA.orgId;

      for (const modelId of [ids.orgBOnly, ids.projectA1Shared]) {
        await expect(
          caller.organizationModels.getById({ orgId, modelId }),
        ).rejects.toThrow("Model not found");
      }
      for (const modelId of [
        ids.orgBOnly,
        ids.projectA1Shared,
        ids.langfuseShared,
      ]) {
        await expect(
          caller.organizationModels.upsert({
            orgId,
            modelId,
            modelName: `hijack-${suffix}`,
            matchPattern: "x",
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
        ).rejects.toThrow("Model not found");
        await expect(
          caller.organizationModels.delete({ orgId, modelId }),
        ).rejects.toThrow("Model not found");
      }
    });

    it("previews matches against organization and Langfuse definitions only", async () => {
      const caller = createCaller(orgA.orgId, orgA.projectId);
      const testMatch = (modelName: string) =>
        caller.organizationModels.testMatch({ orgId: orgA.orgId, modelName });

      const shared = await testMatch(sharedName);
      expect(shared.matched && shared.model.id).toBe(ids.orgAShared);
      expect((await testMatch(orgBName)).matched).toBe(false);
    });
  });

  describe("public models API", () => {
    it("lists each definition's scope and marks organization definitions as read-only", async () => {
      const listed = new Map<
        string,
        { scope: string; isLangfuseManaged: boolean }
      >();
      for (let page = 1, totalPages = 1; page <= totalPages; page++) {
        const response = await makeZodVerifiedAPICall(
          GetModelsV1Response,
          "GET",
          `/api/public/models?page=${page}&limit=100`,
          undefined,
          orgA.auth,
        );
        totalPages = response.body.meta.totalPages;
        for (const m of response.body.data) {
          listed.set(m.id, {
            scope: m.scope,
            isLangfuseManaged: m.isLangfuseManaged,
          });
        }
      }

      expect(listed.get(ids.projectA1Shared)).toEqual({
        scope: "PROJECT",
        isLangfuseManaged: false,
      });
      expect(listed.get(ids.orgAOnly)).toEqual({
        scope: "ORGANIZATION",
        isLangfuseManaged: true,
      });
      expect(listed.get(ids.langfuseShared)).toEqual({
        scope: "LANGFUSE",
        isLangfuseManaged: true,
      });
      expect(listed.has(ids.orgBOnly)).toBe(false);
    });

    it("forbids replacing or deleting own organization definitions, and hides another organization's", async () => {
      const body = {
        modelName: orgOnlyName,
        matchPattern: exact(orgOnlyName),
        unit: "TOKENS",
        inputPrice: 1,
      };

      const put = await makeAPICall<{ message: string }>(
        "PUT",
        `/api/public/models/${ids.orgAOnly}`,
        body,
        orgA.auth,
      );
      expect(put.status).toBe(403);
      expect(put.body.message).toContain("defined by the organization");

      const del = await makeAPICall(
        "DELETE",
        `/api/public/models/${ids.orgAOnly}`,
        undefined,
        orgA.auth,
      );
      expect(del.status).toBe(403);

      const unchanged = await prisma.model.findUniqueOrThrow({
        where: { id: ids.orgAOnly },
        include: { pricingTiers: { include: { prices: true } } },
      });
      expect(unchanged.scope).toBe("ORGANIZATION");
      expect(unchanged.projectId).toBeNull();
      expect(unchanged.pricingTiers[0]?.prices[0]?.price.toString()).toBe(
        "0.004",
      );

      const otherPut = await makeAPICall(
        "PUT",
        `/api/public/models/${ids.orgBOnly}`,
        { ...body, modelName: orgBName, matchPattern: exact(orgBName) },
        orgA.auth,
      );
      expect(otherPut.status).toBe(404);

      const otherDelete = await makeAPICall(
        "DELETE",
        `/api/public/models/${ids.orgBOnly}`,
        undefined,
        orgA.auth,
      );
      expect(otherDelete.status).toBe(404);
    });

    it("gets own organization definitions but not another organization's", async () => {
      const own = await makeZodVerifiedAPICall(
        GetModelV1Response,
        "GET",
        `/api/public/models/${ids.orgAOnly}`,
        undefined,
        orgA.auth,
      );
      expect(own.body.id).toBe(ids.orgAOnly);

      const other = await makeAPICall(
        "GET",
        `/api/public/models/${ids.orgBOnly}`,
        undefined,
        orgA.auth,
      );
      expect(other.status).toBe(404);
    });
  });

  describe("observation price enrichment", () => {
    // Observations store the matched model id; each read must re-check visibility.
    const traceIds = { a: v4(), b: v4() };
    const observationIds = {
      aOwnOrg: v4(),
      aOtherOrg: v4(),
      bOtherOrg: v4(),
    };

    beforeAll(async () => {
      await createTracesCh([
        createTrace({ id: traceIds.a, project_id: orgA.projectId }),
        createTrace({ id: traceIds.b, project_id: orgB.projectId }),
      ]);

      const rows = [
        {
          id: observationIds.aOwnOrg,
          project_id: orgA.projectId,
          trace_id: traceIds.a,
          model: ids.orgAOnly,
        },
        {
          id: observationIds.aOtherOrg,
          project_id: orgA.projectId,
          trace_id: traceIds.a,
          model: ids.orgBOnly,
        },
        {
          id: observationIds.bOtherOrg,
          project_id: orgB.projectId,
          trace_id: traceIds.b,
          model: ids.orgAOnly,
        },
      ];

      await createObservationsCh(
        rows.map(({ model, ...row }) =>
          createObservation({
            ...row,
            type: "GENERATION",
            internal_model_id: model,
            provided_model_name: model,
          }),
        ),
      );
      await createEventsCh(
        rows.map(({ model, ...row }) =>
          createEvent({
            ...row,
            span_id: row.id,
            type: "GENERATION",
            model_id: model,
            provided_model_name: model,
          }),
        ),
      );
    });

    it.each([false, true])(
      "returns prices only for visible definitions (useEventsTable=%s)",
      async (useEventsTable) => {
        const getOne = async (id: string, auth: string) =>
          (
            await makeZodVerifiedAPICall(
              GetObservationV1Response,
              "GET",
              `/api/public/observations/${id}?useEventsTable=${useEventsTable}`,
              undefined,
              auth,
            )
          ).body.inputPrice;

        expect(await getOne(observationIds.aOwnOrg, orgA.auth)).toBe(0.004);
        expect(await getOne(observationIds.aOtherOrg, orgA.auth)).toBeNull();
        expect(await getOne(observationIds.bOtherOrg, orgB.auth)).toBeNull();

        const list = await makeZodVerifiedAPICall(
          GetObservationsV1Response,
          "GET",
          `/api/public/observations?traceId=${traceIds.a}&useEventsTable=${useEventsTable}`,
          undefined,
          orgA.auth,
        );
        const listed = new Map(list.body.data.map((o) => [o.id, o.inputPrice]));
        expect(listed.get(observationIds.aOwnOrg)).toBe(0.004);
        expect(listed.get(observationIds.aOtherOrg)).toBeNull();
      },
    );

    it("returns prices only for visible definitions on trace reads", async () => {
      const trace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${traceIds.a}`,
        undefined,
        orgA.auth,
      );
      const prices = new Map(
        trace.body.observations.map((o) => [o.id, o.inputPrice]),
      );
      expect(prices.get(observationIds.aOwnOrg)).toBe(0.004);
      // Trace reads report an unresolved model's price as 0.
      expect(prices.get(observationIds.aOtherOrg)).toBe(0);
    });

    it("returns prices only for visible definitions in the observations table", async () => {
      const rows = await getObservationsTableWithModelData({
        projectId: orgA.projectId,
        filter: [
          {
            column: "traceId",
            type: "string",
            operator: "=",
            value: traceIds.a,
          },
        ],
        limit: 10,
        offset: 0,
      });
      const prices = new Map(
        rows.map((o) => [o.id, o.inputPrice?.toNumber() ?? null]),
      );
      expect(prices.get(observationIds.aOwnOrg)).toBe(0.004);
      expect(prices.get(observationIds.aOtherOrg)).toBeNull();
    });

    it("loads only visible definitions for exports", async () => {
      const cacheA = createModelCache(orgA.projectId);
      expect((await cacheA.getModel(ids.orgAOnly))?.id).toBe(ids.orgAOnly);
      expect(await cacheA.getModel(ids.orgBOnly)).toBeNull();

      const cacheB = createModelCache(orgB.projectId);
      expect(await cacheB.getModel(ids.orgAOnly)).toBeNull();
    });
  });
});
