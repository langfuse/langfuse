import { createDefaultScoreConfigs } from "@/src/features/projects/server/defaultScoreConfigs";
import { describe, expect, it, vi } from "vitest";

describe("createDefaultScoreConfigs", () => {
  it("resolves when the score configs cannot be created", async () => {
    const db = {
      scoreConfig: {
        createMany: vi
          .fn()
          .mockRejectedValue(new Error("database unavailable")),
      },
    };

    await expect(
      createDefaultScoreConfigs(db, "project-1"),
    ).resolves.toBeUndefined();
  });
});
