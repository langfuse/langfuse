/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const baseURI = "/api/public/v2/prompts";

describe("DELETE /api/public/v2/prompts/{promptName}", () => {
  beforeEach(pruneDatabase);

  it("deletes all versions of a prompt", async () => {
    const name = "deletePrompt" + uuidv4();
    await prisma.prompt.createMany({
      data: [
        {
          id: uuidv4(),
          name,
          prompt: "p1",
          labels: ["production"],
          version: 1,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
        {
          id: uuidv4(),
          name,
          prompt: "p2",
          labels: [],
          version: 2,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      ],
    });

    const res = await makeAPICall("DELETE", `${baseURI}/${encodeURIComponent(name)}`);
    expect(res.status).toBe(204);

    const remaining = await prisma.prompt.findMany({ where: { projectId, name } });
    expect(remaining.length).toBe(0);
  });

  it("deletes by label and version", async () => {
    const name = "deletePromptFiltered" + uuidv4();
    await prisma.prompt.createMany({
      data: [
        {
          id: uuidv4(),
          name,
          prompt: "p1",
          labels: ["production"],
          version: 1,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
        {
          id: uuidv4(),
          name,
          prompt: "p2",
          labels: ["dev"],
          version: 2,
          projectId,
          createdBy: "user",
          config: {},
          type: "TEXT",
        },
      ],
    });

    const res1 = await makeAPICall(
      "DELETE",
      `${baseURI}/${encodeURIComponent(name)}?version=1`,
    );
    expect(res1.status).toBe(204);

    let remaining = await prisma.prompt.findMany({ where: { projectId, name } });
    expect(remaining.length).toBe(1);

    const res2 = await makeAPICall(
      "DELETE",
      `${baseURI}/${encodeURIComponent(name)}?label=dev`,
    );
    expect(res2.status).toBe(204);

    remaining = await prisma.prompt.findMany({ where: { projectId, name } });
    expect(remaining.length).toBe(0);
  });
});
