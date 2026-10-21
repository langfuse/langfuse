import { makeAPICall } from "@/src/__tests__/test-utils";
import {
  createApiKey,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { randomUUID } from "crypto";

type ScimGroup = {
  schemas: string[];
  id: string;
  displayName: string;
  externalId?: string;
  members?: { value: string; display?: string }[];
  meta: { resourceType: string; location: string };
};

type ScimList = {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: ScimGroup[];
};

const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

describe("SCIM Groups API", () => {
  const orgId = "seed-org-id";
  const orgApiKey = `pk-lf-org-${randomUUID().substring(0, 8)}`;
  const orgSecretKey = `sk-lf-org-${randomUUID().substring(0, 8)}`;
  const otherOrgId = `scim-groups-other-org-${randomUUID().substring(0, 8)}`;
  const otherOrgApiKey = `pk-lf-org-${randomUUID().substring(0, 8)}`;
  const otherOrgSecretKey = `sk-lf-org-${randomUUID().substring(0, 8)}`;
  const auth = () => createBasicAuthHeader(orgApiKey, orgSecretKey);
  const otherAuth = () =>
    createBasicAuthHeader(otherOrgApiKey, otherOrgSecretKey);

  // Users that are members of `orgId`
  let alice: string;
  let bob: string;
  let carol: string;
  // A user that is not a member of `orgId`
  let outsider: string;

  const uniqueName = (prefix: string) =>
    `${prefix}-${randomUUID().substring(0, 8)}`;

  const createUserInOrg = async (org: string) => {
    const user = await prisma.user.create({
      data: { email: `scim-group-${randomUUID()}@example.com` },
    });
    await prisma.organizationMembership.create({
      data: { orgId: org, userId: user.id, role: "NONE" },
    });
    return user.id;
  };

  const createGroup = async (body: Record<string, unknown>) =>
    makeAPICall<ScimGroup>(
      "POST",
      "/api/public/scim/Groups",
      { schemas: [GROUP_SCHEMA], ...body },
      auth(),
    );

  const patchGroup = async (id: string, Operations: unknown[]) =>
    makeAPICall<ScimGroup>(
      "PATCH",
      `/api/public/scim/Groups/${id}`,
      { schemas: [PATCH_SCHEMA], Operations },
      auth(),
    );

  const memberIds = (group: ScimGroup) =>
    (group.members ?? []).map((m) => m.value).sort();

  beforeAll(async () => {
    const keyCreator = await prisma.user.create({
      data: { email: `apikey-creator-${randomUUID()}@example.com` },
    });
    await prisma.organization.create({
      data: {
        id: otherOrgId,
        name: "SCIM groups other org",
        // Same plan as the seed org, so the admin-api entitlement passes and
        // the org-isolation checks are what's under test.
        cloudConfig: { plan: "Team" },
      },
    });
    await createApiKey(prisma, {
      owner: OrganizationId(orgId),
      role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
      createdBy: UserId(keyCreator.id),
      predefinedKeys: { publicKey: orgApiKey, secretKey: orgSecretKey },
    });
    await createApiKey(prisma, {
      owner: OrganizationId(otherOrgId),
      role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
      createdBy: UserId(keyCreator.id),
      predefinedKeys: {
        publicKey: otherOrgApiKey,
        secretKey: otherOrgSecretKey,
      },
    });

    alice = await createUserInOrg(orgId);
    bob = await createUserInOrg(orgId);
    carol = await createUserInOrg(orgId);
    outsider = await createUserInOrg(otherOrgId);
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: otherOrgId } });
  });

  describe("discovery", () => {
    it("advertises the Group resource type and schema", async () => {
      const resourceTypes = await makeAPICall<{
        Resources: { id: string; endpoint: string }[];
      }>("GET", "/api/public/scim/ResourceTypes", undefined, auth());
      expect(resourceTypes.status).toBe(200);
      expect(resourceTypes.body.Resources).toContainEqual(
        expect.objectContaining({
          id: "Group",
          endpoint: "/api/public/scim/Groups",
        }),
      );

      const schemas = await makeAPICall<{
        totalResults: number;
        Resources: { id: string }[];
      }>("GET", "/api/public/scim/Schemas", undefined, auth());
      expect(schemas.body.Resources.map((r) => r.id)).toContain(GROUP_SCHEMA);
      expect(schemas.body.totalResults).toBe(schemas.body.Resources.length);
    });
  });

  describe("POST /Groups", () => {
    it("creates a group with members (Okta Group Push)", async () => {
      const displayName = uniqueName("okta-push");
      const externalId = uniqueName("00g");
      const res = await createGroup({
        displayName,
        externalId,
        members: [{ value: alice, display: "alice@example.com" }],
      });

      expect(res.status).toBe(201);
      expect(res.body.schemas).toEqual([GROUP_SCHEMA]);
      expect(res.body.displayName).toBe(displayName);
      expect(res.body.externalId).toBe(externalId);
      expect(memberIds(res.body)).toEqual([alice]);
      expect(res.body.meta.resourceType).toBe("Group");
      expect(res.body.meta.location).toBe(
        `/api/public/scim/Groups/${res.body.id}`,
      );
    });

    it("creates an empty group (Entra creates groups without members)", async () => {
      const res = await createGroup({ displayName: uniqueName("entra") });
      expect(res.status).toBe(201);
      expect(res.body.members).toEqual([]);
    });

    it("allows two groups with the same displayName (Entra ID does)", async () => {
      const displayName = uniqueName("dup");
      expect((await createGroup({ displayName })).status).toBe(201);
      expect((await createGroup({ displayName })).status).toBe(201);
    });

    it("returns 409 for a duplicate externalId in the same org", async () => {
      const externalId = uniqueName("ext");
      expect(
        (await createGroup({ displayName: uniqueName("a"), externalId }))
          .status,
      ).toBe(201);
      const res = await createGroup({
        displayName: uniqueName("b"),
        externalId,
      });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ scimType: "uniqueness" });
    });

    it("returns 400 when displayName is missing", async () => {
      const res = await createGroup({});
      expect(res.status).toBe(400);
    });

    it("returns 400 when a member is not part of the organization", async () => {
      const displayName = uniqueName("outsider");
      const res = await createGroup({
        displayName,
        members: [{ value: outsider }],
      });
      expect(res.status).toBe(400);
      // Nothing is created on failure
      const count = await prisma.group.count({
        where: { orgId, displayName },
      });
      expect(count).toBe(0);
    });

    it("rejects project API keys", async () => {
      const res = await makeAPICall(
        "POST",
        "/api/public/scim/Groups",
        { schemas: [GROUP_SCHEMA], displayName: uniqueName("project-key") },
        createBasicAuthHeader("pk-lf-1234567890", "sk-lf-1234567890"),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET /Groups", () => {
    it("filters by displayName and honours excludedAttributes=members", async () => {
      const displayName = uniqueName("filter me");
      await createGroup({ displayName, members: [{ value: alice }] });

      const filter = encodeURIComponent(`displayName eq "${displayName}"`);
      const res = await makeAPICall<ScimList>(
        "GET",
        `/api/public/scim/Groups?filter=${filter}&excludedAttributes=members`,
        undefined,
        auth(),
      );
      expect(res.status).toBe(200);
      expect(res.body.totalResults).toBe(1);
      expect(res.body.Resources[0].displayName).toBe(displayName);
      expect(res.body.Resources[0]).not.toHaveProperty("members");
    });

    it("filters by externalId", async () => {
      const externalId = randomUUID();
      await createGroup({ displayName: uniqueName("ext"), externalId });
      const filter = encodeURIComponent(`externalId eq "${externalId}"`);
      const res = await makeAPICall<ScimList>(
        "GET",
        `/api/public/scim/Groups?filter=${filter}`,
        undefined,
        auth(),
      );
      expect(res.body.totalResults).toBe(1);
      expect(res.body.Resources[0].externalId).toBe(externalId);
    });

    it("returns an empty list when nothing matches", async () => {
      const filter = encodeURIComponent(`displayName eq "${randomUUID()}"`);
      const res = await makeAPICall<ScimList>(
        "GET",
        `/api/public/scim/Groups?filter=${filter}`,
        undefined,
        auth(),
      );
      expect(res.status).toBe(200);
      expect(res.body.totalResults).toBe(0);
      expect(res.body.Resources).toEqual([]);
    });

    it("returns 400 for an unsupported filter", async () => {
      const filter = encodeURIComponent(`displayName co "x"`);
      const res = await makeAPICall(
        "GET",
        `/api/public/scim/Groups?filter=${filter}`,
        undefined,
        auth(),
      );
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ scimType: "invalidFilter" });
    });

    it("paginates with startIndex and count", async () => {
      const page1 = await makeAPICall<ScimList>(
        "GET",
        "/api/public/scim/Groups?startIndex=1&count=1",
        undefined,
        auth(),
      );
      const page2 = await makeAPICall<ScimList>(
        "GET",
        "/api/public/scim/Groups?startIndex=2&count=1",
        undefined,
        auth(),
      );
      expect(page1.body.itemsPerPage).toBe(1);
      expect(page1.body.totalResults).toBeGreaterThan(1);
      expect(page2.body.startIndex).toBe(2);
      expect(page1.body.Resources[0].id).not.toBe(page2.body.Resources[0].id);
    });

    it("does not list groups of another organization", async () => {
      const displayName = uniqueName("isolated");
      await createGroup({ displayName });
      const filter = encodeURIComponent(`displayName eq "${displayName}"`);
      const res = await makeAPICall<ScimList>(
        "GET",
        `/api/public/scim/Groups?filter=${filter}`,
        undefined,
        otherAuth(),
      );
      expect(res.body.totalResults).toBe(0);
    });
  });

  describe("GET /Groups/{id}", () => {
    it("returns the group with members", async () => {
      const created = await createGroup({
        displayName: uniqueName("get"),
        members: [{ value: alice }, { value: bob }],
      });
      const res = await makeAPICall<ScimGroup>(
        "GET",
        `/api/public/scim/Groups/${created.body.id}`,
        undefined,
        auth(),
      );
      expect(res.status).toBe(200);
      expect(memberIds(res.body)).toEqual([alice, bob].sort());
    });

    it("returns 404 for a group of another organization", async () => {
      const created = await createGroup({ displayName: uniqueName("cross") });
      const res = await makeAPICall(
        "GET",
        `/api/public/scim/Groups/${created.body.id}`,
        undefined,
        otherAuth(),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /Groups/{id}", () => {
    it("adds members with Entra's capitalized op and a single object value", async () => {
      const created = await createGroup({ displayName: uniqueName("patch") });
      const res = await patchGroup(created.body.id, [
        { op: "Add", path: "members", value: { value: alice } },
      ]);
      expect(res.status).toBe(200);
      expect(memberIds(res.body)).toEqual([alice]);
    });

    it("adding an existing member is a no-op", async () => {
      const created = await createGroup({
        displayName: uniqueName("patch"),
        members: [{ value: alice }],
      });
      const res = await patchGroup(created.body.id, [
        { op: "add", path: "members", value: [{ value: alice }] },
      ]);
      expect(res.status).toBe(200);
      expect(memberIds(res.body)).toEqual([alice]);
    });

    it("removes a member via filtered path (Okta)", async () => {
      const created = await createGroup({
        displayName: uniqueName("patch"),
        members: [{ value: alice }, { value: bob }],
      });
      const res = await patchGroup(created.body.id, [
        { op: "remove", path: `members[value eq "${alice}"]` },
      ]);
      expect(res.status).toBe(200);
      expect(memberIds(res.body)).toEqual([bob]);
    });

    it("removes members listed in value (Entra) and leaves the rest", async () => {
      const created = await createGroup({
        displayName: uniqueName("patch"),
        members: [{ value: alice }, { value: bob }, { value: carol }],
      });
      const res = await patchGroup(created.body.id, [
        { op: "Remove", path: "members", value: [{ value: bob }] },
      ]);
      expect(res.status).toBe(200);
      expect(memberIds(res.body)).toEqual([alice, carol].sort());
    });

    it("removes all members when remove has no value", async () => {
      const created = await createGroup({
        displayName: uniqueName("patch"),
        members: [{ value: alice }, { value: bob }],
      });
      const res = await patchGroup(created.body.id, [
        { op: "remove", path: "members" },
      ]);
      expect(memberIds(res.body)).toEqual([]);
    });

    it("applies a pathless replace with displayName and members (Okta)", async () => {
      const created = await createGroup({
        displayName: uniqueName("patch"),
        members: [{ value: alice }],
      });
      const newName = uniqueName("renamed");
      const res = await patchGroup(created.body.id, [
        {
          op: "replace",
          value: {
            id: created.body.id,
            displayName: newName,
            members: [{ value: bob }],
          },
        },
      ]);
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe(newName);
      expect(memberIds(res.body)).toEqual([bob]);
    });

    it("sets externalId via path (Entra links existing groups this way)", async () => {
      const created = await createGroup({ displayName: uniqueName("patch") });
      const externalId = randomUUID();
      const res = await patchGroup(created.body.id, [
        { op: "Add", path: "externalId", value: externalId },
      ]);
      expect(res.body.externalId).toBe(externalId);
    });

    it("rejects the whole request when a member is not in the org", async () => {
      const created = await createGroup({
        displayName: uniqueName("patch"),
        members: [{ value: alice }],
      });
      const res = await patchGroup(created.body.id, [
        { op: "add", path: "members", value: [{ value: bob }] },
        { op: "add", path: "members", value: [{ value: outsider }] },
      ]);
      expect(res.status).toBe(400);
      // bob's add was rolled back with the failing op
      const group = await prisma.group.findUniqueOrThrow({
        where: { id: created.body.id },
        include: { members: { include: { organizationMembership: true } } },
      });
      expect(group.members.map((m) => m.organizationMembership.userId)).toEqual(
        [alice],
      );
    });

    it("returns 409 when changing externalId to one already in use", async () => {
      const taken = uniqueName("taken");
      await createGroup({ displayName: uniqueName("a"), externalId: taken });
      const created = await createGroup({ displayName: uniqueName("patch") });
      const res = await patchGroup(created.body.id, [
        { op: "replace", path: "externalId", value: taken },
      ]);
      expect(res.status).toBe(409);
    });

    it("returns 400 without the PatchOp schema", async () => {
      const created = await createGroup({ displayName: uniqueName("patch") });
      const res = await makeAPICall(
        "PATCH",
        `/api/public/scim/Groups/${created.body.id}`,
        { Operations: [] },
        auth(),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /Groups/{id}", () => {
    it("replaces displayName and the full member list", async () => {
      const created = await createGroup({
        displayName: uniqueName("put"),
        externalId: uniqueName("keep-me-not"),
        members: [{ value: alice }, { value: bob }],
      });
      const newName = uniqueName("put-renamed");
      const res = await makeAPICall<ScimGroup>(
        "PUT",
        `/api/public/scim/Groups/${created.body.id}`,
        {
          schemas: [GROUP_SCHEMA],
          displayName: newName,
          members: [{ value: bob }, { value: carol }],
        },
        auth(),
      );
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe(newName);
      expect(res.body.externalId).toBeUndefined();
      expect(memberIds(res.body)).toEqual([bob, carol].sort());
    });
  });

  describe("DELETE /Groups/{id}", () => {
    it("deletes the group", async () => {
      const created = await createGroup({
        displayName: uniqueName("delete"),
        members: [{ value: alice }],
      });
      const res = await makeAPICall(
        "DELETE",
        `/api/public/scim/Groups/${created.body.id}`,
        undefined,
        auth(),
      );
      expect(res.status).toBe(204);
      const after = await makeAPICall(
        "GET",
        `/api/public/scim/Groups/${created.body.id}`,
        undefined,
        auth(),
      );
      expect(after.status).toBe(404);
    });

    it("cannot delete a group of another organization", async () => {
      const created = await createGroup({ displayName: uniqueName("delete") });
      const res = await makeAPICall(
        "DELETE",
        `/api/public/scim/Groups/${created.body.id}`,
        undefined,
        otherAuth(),
      );
      expect(res.status).toBe(404);
      expect(await prisma.group.count({ where: { id: created.body.id } })).toBe(
        1,
      );
    });
  });

  it("drops group memberships when the user is deprovisioned from the org", async () => {
    const dave = await createUserInOrg(orgId);
    const created = await createGroup({
      displayName: uniqueName("deprovision"),
      members: [{ value: dave }, { value: alice }],
    });
    const res = await makeAPICall(
      "DELETE",
      `/api/public/scim/Users/${dave}`,
      undefined,
      auth(),
    );
    expect(res.status).toBe(204);

    const group = await makeAPICall<ScimGroup>(
      "GET",
      `/api/public/scim/Groups/${created.body.id}`,
      undefined,
      auth(),
    );
    expect(memberIds(group.body)).toEqual([alice]);
  });
});
