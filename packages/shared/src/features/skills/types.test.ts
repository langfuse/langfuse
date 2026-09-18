import { describe, expect, it } from "vitest";
import {
  CreateSkillVersionBodySchema,
  SkillBlobDescriptorSchema,
  SkillFilePathSchema,
  SkillNameSchema,
  UpdateSkillLabelsBodySchema,
  UpdateSkillTagsBodySchema,
} from "./types";

describe("skill contracts", () => {
  it.each(["support-triage", "pdf", "skill-2"])(
    "accepts a portable skill name: %s",
    (name) => expect(SkillNameSchema.safeParse(name).success).toBe(true),
  );

  it.each(["Support", "support_triage", "support--triage", "-support"])(
    "rejects a non-portable skill name: %s",
    (name) => expect(SkillNameSchema.safeParse(name).success).toBe(false),
  );

  it.each([
    "/SKILL.md",
    "../SKILL.md",
    "references/../SKILL.md",
    "references\\file.md",
    "references//file.md",
    "references/",
    "references/\0file.md",
  ])("rejects an unsafe file path: %s", (path) => {
    expect(SkillFilePathSchema.safeParse(path).success).toBe(false);
  });

  it("requires one root SKILL.md and unique paths", () => {
    const base = {
      name: "support-triage",
      labels: [],
    };
    expect(
      CreateSkillVersionBodySchema.safeParse({
        ...base,
        files: [{ path: "references/a.md", blobId: "blob-1" }],
      }).success,
    ).toBe(false);
    expect(
      CreateSkillVersionBodySchema.safeParse({
        ...base,
        files: [
          { path: "SKILL.md", blobId: "blob-1" },
          { path: "SKILL.md", blobId: "blob-2" },
        ],
      }).success,
    ).toBe(false);
  });

  it("does not require a duplicate skill name in the create payload", () => {
    expect(
      CreateSkillVersionBodySchema.safeParse({
        files: [{ path: "SKILL.md", blobId: "blob-1" }],
        labels: [],
      }).success,
    ).toBe(true);
  });

  it("rejects a base64-looking hash that is not a canonical SHA-256", () => {
    expect(
      SkillBlobDescriptorSchema.safeParse({
        sha256Hash: "A".repeat(44),
        contentType: "text/markdown",
        contentLength: 1,
      }).success,
    ).toBe(false);
  });

  it("keeps the virtual latest label out of stored skill labels", () => {
    expect(
      UpdateSkillLabelsBodySchema.safeParse({ labels: ["production"] }).success,
    ).toBe(true);
    expect(
      UpdateSkillLabelsBodySchema.safeParse({ labels: ["latest"] }).success,
    ).toBe(false);
  });

  it("validates stored skill tags", () => {
    expect(
      UpdateSkillTagsBodySchema.safeParse({ tags: ["support", "internal"] })
        .success,
    ).toBe(true);
    expect(UpdateSkillTagsBodySchema.safeParse({ tags: [" "] }).success).toBe(
      false,
    );
  });
});
