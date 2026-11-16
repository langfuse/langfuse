import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SkillVersionSchema } from "@langfuse/shared";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import { GetSkillFileContentsResponseSchema } from "@/src/features/public-api/types/skills";

describe("GET /api/public/skills/files/content tenant isolation", () => {
  it("only returns content belonging to the authenticated project", async () => {
    const projects = await Promise.all(
      [0, 1].map(async () => {
        const { auth } = await createOrgProjectAndApiKey();
        const content = `---\nname: tenant-isolation\ndescription: Test skill\n---\nPrivate instructions ${randomUUID()}`;
        const { body: skill } = await makeZodVerifiedAPICall(
          SkillVersionSchema,
          "POST",
          "/api/public/skills",
          { files: [{ path: "SKILL.md", content }] },
          auth,
          201,
        );
        return { auth, content, sha256Hash: skill.files[0].sha256Hash };
      }),
    );

    const contentUrl = (hashes: string[]) =>
      `/api/public/skills/files/content?${new URLSearchParams({
        sha256Hashes: hashes.join(","),
      })}`;

    for (const [own, other] of [projects, [...projects].reverse()]) {
      const { body } = await makeZodVerifiedAPICall(
        GetSkillFileContentsResponseSchema,
        "GET",
        contentUrl([own.sha256Hash]),
        undefined,
        own.auth,
      );
      expect(body).toEqual({
        data: [{ sha256Hash: own.sha256Hash, content: own.content }],
      });

      for (const hashes of [
        [other.sha256Hash],
        [own.sha256Hash, other.sha256Hash],
      ]) {
        const response = await makeAPICall(
          "GET",
          contentUrl(hashes),
          undefined,
          own.auth,
        );
        expect(response.status).toBe(404);
        expect(response.body).not.toHaveProperty("data");
      }
    }
  });
});
