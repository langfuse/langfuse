import { randomUUID } from "node:crypto";

import { OrganizationId, SystemRoleId } from "@langfuse/shared/rbac";
import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteOrganizationModelV1Response,
  GetOrganizationModelsV1Response,
  GetOrganizationModelV1Response,
  PutOrganizationModelV1Response,
} from "@/src/features/public-api/types/organization-models";

const BASE = "/api/public/organizations/models";

async function createOrganizationWithKey() {
  const fixture = await createOrgProjectAndApiKey({ plan: "Team" });
  const { publicKey, secretKey } = await createApiKey(prisma, {
    tenant: OrganizationId(fixture.orgId),
    scope: OrganizationId(fixture.orgId),
    role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
    createdBy: "system",
  });
  return { ...fixture, orgAuth: createBasicAuthHeader(publicKey, secretKey) };
}

const modelBody = (modelName: string, inputPrice = 0.000001) => ({
  modelName,
  matchPattern: `(?i)^${modelName}$`,
  pricingTiers: [
    {
      name: "Standard",
      isDefault: true,
      priority: 0,
      conditions: [],
      prices: { input: inputPrice, output: 0.000002 },
    },
    {
      name: "Long context",
      isDefault: false,
      priority: 1,
      conditions: [
        { usageDetailPattern: "^input", operator: "gt", value: 200000 },
      ],
      prices: { input: inputPrice * 2, output: 0.000004 },
    },
  ],
});

describe("/api/public/organizations/models", () => {
  const langfuseModelName = `langfuse-default-${randomUUID()}`;
  let langfuseModelId: string;

  beforeAll(async () => {
    const model = await prisma.model.create({
      data: {
        scope: "LANGFUSE",
        modelName: langfuseModelName,
        matchPattern: `(?i)^${langfuseModelName}$`,
      },
    });
    langfuseModelId = model.id;
  });

  afterAll(async () => {
    await prisma.model.deleteMany({ where: { id: langfuseModelId } });
  });

  it("creates on the first PUT of a name and replaces on the second", async () => {
    const { orgId, orgAuth } = await createOrganizationWithKey();
    const name = `org-model-${randomUUID()}`;

    const created = await makeZodVerifiedAPICall(
      PutOrganizationModelV1Response,
      "PUT",
      BASE,
      modelBody(name),
      orgAuth,
      201,
    );
    expect(created.body).toMatchObject({
      scope: "ORGANIZATION",
      modelName: name,
    });
    expect(created.body.pricingTiers).toHaveLength(2);

    const replaced = await makeZodVerifiedAPICall(
      PutOrganizationModelV1Response,
      "PUT",
      BASE,
      {
        ...modelBody(name, 0.000005),
        pricingTiers: [modelBody(name, 0.000005).pricingTiers[0]],
      },
      orgAuth,
      200,
    );
    expect(replaced.body.id).toBe(created.body.id);
    expect(replaced.body.pricingTiers).toHaveLength(1);
    expect(replaced.body.pricingTiers[0].prices).toEqual({
      input: 0.000005,
      output: 0.000002,
    });

    const stored = await prisma.model.findMany({
      where: { organizationId: orgId, modelName: name },
    });
    expect(stored).toHaveLength(1);

    // Names are addressed exactly, so a name the settings UI stored with
    // surrounding whitespace can be replaced through the API.
    const spacedName = ` ${name} `;
    const spaced = await makeZodVerifiedAPICall(
      PutOrganizationModelV1Response,
      "PUT",
      BASE,
      modelBody(spacedName),
      orgAuth,
      201,
    );
    expect(spaced.body.modelName).toBe(spacedName);
    const spacedAgain = await makeZodVerifiedAPICall(
      PutOrganizationModelV1Response,
      "PUT",
      BASE,
      modelBody(spacedName),
      orgAuth,
      200,
    );
    expect(spacedAgain.body.id).toBe(spaced.body.id);
  });

  it("lists only organization models by default and Langfuse models on request", async () => {
    const { orgAuth } = await createOrganizationWithKey();
    const name = `org-model-${randomUUID()}`;
    await makeAPICall("PUT", BASE, modelBody(name), orgAuth);

    const own = await makeZodVerifiedAPICall(
      GetOrganizationModelsV1Response,
      "GET",
      BASE,
      undefined,
      orgAuth,
    );
    expect(own.body.data.map((m) => m.modelName)).toEqual([name]);
    expect(own.body.meta.totalItems).toBe(1);

    const defaults = await makeZodVerifiedAPICall(
      GetOrganizationModelsV1Response,
      "GET",
      `${BASE}?scope=LANGFUSE&search=${langfuseModelName}`,
      undefined,
      orgAuth,
    );
    expect(defaults.body.data).toEqual([
      expect.objectContaining({ id: langfuseModelId, scope: "LANGFUSE" }),
    ]);

    const langfuseModel = await makeZodVerifiedAPICall(
      GetOrganizationModelV1Response,
      "GET",
      `${BASE}/${langfuseModelId}`,
      undefined,
      orgAuth,
    );
    expect(langfuseModel.body.scope).toBe("LANGFUSE");
  });

  it("pages from 1 like the other public APIs", async () => {
    const { orgAuth } = await createOrganizationWithKey();
    const names = [`a-${randomUUID()}`, `b-${randomUUID()}`];
    for (const name of names) {
      await makeAPICall("PUT", BASE, modelBody(name), orgAuth);
    }

    for (const [index, name] of names.entries()) {
      const page = await makeZodVerifiedAPICall(
        GetOrganizationModelsV1Response,
        "GET",
        `${BASE}?page=${index + 1}&limit=1`,
        undefined,
        orgAuth,
      );
      expect(page.body.data.map((m) => m.modelName)).toEqual([name]);
      expect(page.body.meta).toEqual({
        page: index + 1,
        limit: 1,
        totalItems: 2,
        totalPages: 2,
      });
    }

    const zero = await makeAPICall("GET", `${BASE}?page=0`, undefined, orgAuth);
    expect(zero.status).toBe(400);
    expect(zero.body).toMatchObject({ code: "invalid_query" });
  });

  it("refuses to delete a Langfuse model", async () => {
    const { orgAuth } = await createOrganizationWithKey();

    const response = await makeAPICall(
      "DELETE",
      `${BASE}/${langfuseModelId}`,
      undefined,
      orgAuth,
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "access_denied" });
    expect(
      await prisma.model.findUnique({ where: { id: langfuseModelId } }),
    ).not.toBeNull();
  });

  it("keeps another organization's models out of reach", async () => {
    const [owner, other] = await Promise.all([
      createOrganizationWithKey(),
      createOrganizationWithKey(),
    ]);
    const name = `org-model-${randomUUID()}`;
    const { body: ownerModel } = await makeZodVerifiedAPICall(
      PutOrganizationModelV1Response,
      "PUT",
      BASE,
      modelBody(name),
      owner.orgAuth,
      201,
    );

    const read = await makeAPICall(
      "GET",
      `${BASE}/${ownerModel.id}`,
      undefined,
      other.orgAuth,
    );
    expect(read.status).toBe(404);
    expect(read.body).toMatchObject({ code: "resource_not_found" });

    const deleted = await makeAPICall(
      "DELETE",
      `${BASE}/${ownerModel.id}`,
      undefined,
      other.orgAuth,
    );
    expect(deleted.status).toBe(404);

    // The same name creates the other organization's own model.
    const { body: otherModel } = await makeZodVerifiedAPICall(
      PutOrganizationModelV1Response,
      "PUT",
      BASE,
      modelBody(name, 0.000009),
      other.orgAuth,
      201,
    );
    expect(otherModel.id).not.toBe(ownerModel.id);

    const ownerView = await makeZodVerifiedAPICall(
      GetOrganizationModelV1Response,
      "GET",
      `${BASE}/${ownerModel.id}`,
      undefined,
      owner.orgAuth,
    );
    expect(ownerView.body.pricingTiers[0].prices.input).toBe(0.000001);

    await makeZodVerifiedAPICall(
      DeleteOrganizationModelV1Response,
      "DELETE",
      `${BASE}/${ownerModel.id}`,
      undefined,
      owner.orgAuth,
    );
    expect(
      await prisma.model.findUnique({ where: { id: ownerModel.id } }),
    ).toBeNull();
    expect(
      await prisma.model.findUnique({ where: { id: otherModel.id } }),
    ).not.toBeNull();
  });

  it("denies a member organization key without organization model scopes", async () => {
    const { orgId, orgAuth } = await createOrganizationWithKey();
    const name = `org-model-${randomUUID()}`;
    const { body: model } = await makeZodVerifiedAPICall(
      PutOrganizationModelV1Response,
      "PUT",
      BASE,
      modelBody(name),
      orgAuth,
      201,
    );
    const { publicKey, secretKey } = await createApiKey(prisma, {
      tenant: OrganizationId(orgId),
      scope: OrganizationId(orgId),
      role: SystemRoleId("MEMBER"),
      createdBy: "system",
    });
    const memberAuth = createBasicAuthHeader(publicKey, secretKey);

    const denied = await Promise.all([
      makeAPICall("GET", BASE, undefined, memberAuth),
      makeAPICall("GET", `${BASE}/${model.id}`, undefined, memberAuth),
      makeAPICall("PUT", BASE, modelBody(name, 0.000009), memberAuth),
      makeAPICall("DELETE", `${BASE}/${model.id}`, undefined, memberAuth),
    ]);
    for (const response of denied) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: "access_denied" });
    }

    const after = await makeZodVerifiedAPICall(
      GetOrganizationModelV1Response,
      "GET",
      `${BASE}/${model.id}`,
      undefined,
      orgAuth,
    );
    expect(after.body).toEqual(model);
  });

  it("rejects legacy fields, invalid tiers and project keys", async () => {
    const { orgAuth, auth: projectAuth } = await createOrganizationWithKey();
    const name = `org-model-${randomUUID()}`;

    const legacy = await makeAPICall(
      "PUT",
      BASE,
      { ...modelBody(name), inputPrice: 0.000001 },
      orgAuth,
    );
    expect(legacy.status).toBe(400);
    expect(legacy.body).toMatchObject({ code: "invalid_body" });

    const body = modelBody(name);
    const mismatchedKeys = await makeAPICall(
      "PUT",
      BASE,
      {
        ...body,
        pricingTiers: [
          body.pricingTiers[0],
          { ...body.pricingTiers[1], prices: { input: 0.000002 } },
        ],
      },
      orgAuth,
    );
    expect(mismatchedKeys.status).toBe(400);
    expect(mismatchedKeys.body).toMatchObject({ code: "invalid_body" });

    const badPattern = await makeAPICall(
      "PUT",
      BASE,
      { ...body, matchPattern: "(?i)^[unclosed$" },
      orgAuth,
    );
    expect(badPattern.status).toBe(400);
    expect(badPattern.body).toMatchObject({ code: "invalid_body" });

    const projectKey = await makeAPICall("GET", BASE, undefined, projectAuth);
    expect(projectKey.status).toBe(403);
    expect(projectKey.body).toMatchObject({ code: "access_denied" });
  });
});
