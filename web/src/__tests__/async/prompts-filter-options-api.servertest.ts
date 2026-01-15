/** @jest-environment node */

import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { GetPromptFilterOptionsV2Response } from "@/src/features/public-api/types/prompts";

describe("/api/public/v2/prompts/filterOptions API Endpoint", () => {
  it("should return prompt filter options (name/tags/labels) for a project", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const response = await makeZodVerifiedAPICall(
      GetPromptFilterOptionsV2Response,
      "GET",
      "/api/public/v2/prompts/filterOptions",
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.name)).toBe(true);
    expect(Array.isArray(response.body.tags)).toBe(true);
    expect(Array.isArray(response.body.labels)).toBe(true);
  });
});

