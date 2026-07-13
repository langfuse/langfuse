import { prisma } from "@langfuse/shared/src/db";
import { disconnectQueues, makeAPICall } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { SkillSchema } from "@langfuse/shared";
import { type SkillsMetaResponse } from "@/src/features/skills/server/actions/getSkillsMeta";

// Default seeded project + API key (pk-lf-1234567890 / sk-lf-1234567890)
const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const baseURI = "/api/public/v2/skills";

// Response shape returned by the public API (Prisma row serialised to JSON)
const SkillResponseSchema = SkillSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
});

afterAll(async () => {
  await disconnectQueues();
});

describe("Skills public API (v2)", () => {
  const createdNames: string[] = [];

  afterEach(async () => {
    if (createdNames.length > 0) {
      await prisma.skill.deleteMany({
        where: { projectId, name: { in: createdNames } },
      });
      createdNames.length = 0;
    }
  });

  it("creates, fetches, versions, relabels and deletes a skill", async () => {
    const name = `test-skill-${uuidv4()}`;
    createdNames.push(name);

    // POST create version 1
    const createRes = await makeAPICall(
      "POST",
      baseURI,
      {
        name,
        description: "A test skill",
        instructions: "Do the thing, then do the other thing.",
        allowedTools: ["read", "write"],
        metadata: { author: "test" },
        labels: ["production"],
        tags: ["alpha"],
        commitMessage: "initial version",
      },
      undefined,
    );
    expect(createRes.status).toBe(201);
    const created = SkillResponseSchema.parse(createRes.body);
    expect(created.version).toBe(1);
    expect(created.instructions).toBe("Do the thing, then do the other thing.");
    expect(created.allowedTools).toEqual(["read", "write"]);
    // newly created versions are always labelled "latest"
    expect(created.labels).toEqual(
      expect.arrayContaining(["production", "latest"]),
    );

    // GET by name (defaults to production label)
    const getRes = await makeAPICall(
      "GET",
      `${baseURI}/${name}`,
      undefined,
      undefined,
    );
    expect(getRes.status).toBe(200);
    const fetched = SkillResponseSchema.parse(getRes.body);
    expect(fetched.version).toBe(1);

    // GET by explicit version
    const getVersionRes = await makeAPICall(
      "GET",
      `${baseURI}/${name}?version=1`,
      undefined,
      undefined,
    );
    expect(getVersionRes.status).toBe(200);
    expect(SkillResponseSchema.parse(getVersionRes.body).version).toBe(1);

    // POST create version 2 -> bumps version, moves "latest" off v1
    const createV2Res = await makeAPICall(
      "POST",
      baseURI,
      {
        name,
        description: "A test skill v2",
        instructions: "An improved instruction body.",
      },
      undefined,
    );
    expect(createV2Res.status).toBe(201);
    expect(SkillResponseSchema.parse(createV2Res.body).version).toBe(2);

    // list -> one entry with both versions
    const listRes = await makeAPICall<SkillsMetaResponse>(
      "GET",
      `${baseURI}?name=${name}`,
      undefined,
      undefined,
    );
    expect(listRes.status).toBe(200);
    const entry = listRes.body.data.find((s) => s.name === name);
    expect(entry).toBeDefined();
    expect(entry?.versions.sort()).toEqual([1, 2]);

    // PATCH labels on version 1
    const patchRes = await makeAPICall(
      "PATCH",
      `${baseURI}/${name}/versions/1`,
      { newLabels: ["staging"] },
      undefined,
    );
    expect(patchRes.status).toBe(200);
    const relabeled = SkillResponseSchema.parse(patchRes.body);
    expect(relabeled.version).toBe(1);
    expect(relabeled.labels).toEqual(expect.arrayContaining(["staging"]));

    // PATCH rejects the reserved "latest" label
    const patchLatestRes = await makeAPICall(
      "PATCH",
      `${baseURI}/${name}/versions/1`,
      { newLabels: ["latest"] },
      undefined,
    );
    expect(patchLatestRes.status).toBe(400);

    // DELETE all versions
    const deleteRes = await makeAPICall(
      "DELETE",
      `${baseURI}/${name}`,
      undefined,
      undefined,
    );
    expect(deleteRes.status).toBe(204);

    const remaining = await prisma.skill.findMany({
      where: { projectId, name },
    });
    expect(remaining).toHaveLength(0);
  });

  it("returns 404 for an unknown skill", async () => {
    const res = await makeAPICall(
      "GET",
      `${baseURI}/does-not-exist-${uuidv4()}`,
      undefined,
      undefined,
    );
    expect(res.status).toBe(404);
  });
});
