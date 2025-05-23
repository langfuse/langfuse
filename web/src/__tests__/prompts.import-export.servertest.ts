/** @jest-environment node */

import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { PromptSchema } from "@/src/features/prompts/server/utils/validation";

const baseURI = "/api/public/v2/prompts";

describe("prompt export/import", () => {
  beforeAll(pruneDatabase);
  afterAll(pruneDatabase);

  it("should export prompts and import them", async () => {
    await makeAPICall("POST", baseURI, {
      name: "prompt-export-1",
      prompt: "hello",
      labels: ["production"],
    });
    await makeAPICall("POST", baseURI, {
      name: "prompt-export-2",
      prompt: "world",
      labels: ["production"],
    });

    const exported = await makeAPICall<unknown[]>("GET", `${baseURI}/export`);
    expect(exported.status).toBe(200);
    const prompts = PromptSchema.array().parse(exported.body);
    expect(prompts.length).toBe(2);

    await pruneDatabase();

    const importRes = await makeAPICall("POST", `${baseURI}/import`, {
      prompts,
    });
    expect(importRes.status).toBe(201);

    const { body } = await makeAPICall(
      "GET",
      `${baseURI}/${encodeURIComponent(prompts[0].name)}`,
    );
    expect(body.name).toBe(prompts[0].name);
  });
});
