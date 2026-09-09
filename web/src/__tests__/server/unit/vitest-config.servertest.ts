import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ViteUserConfig } from "vitest/config";
import packageJson from "../../../../package.json";

// Load build-tool configuration only in Vitest, not in the application type graph.
const { default: config } = await vi.importActual<{ default: ViteUserConfig }>(
  "../../../../vitest.config.mjs",
);

// Global cache invalidation must not overlap any other server test's fixtures.
describe("server test scheduling", () => {
  it("runs global API-key cache mutations exclusively after other server projects", () => {
    const projects = config.test!.projects!.flatMap((project) =>
      typeof project === "object" && "test" in project ? [project.test!] : [],
    );
    const destructiveFiles = [
      "src/__tests__/server/admin-api-keys.servertest.ts",
      "src/__tests__/server/api-auth.servertest.ts",
    ];
    const owners = destructiveFiles.map((file) =>
      projects.filter((project) => project.include?.includes(file)),
    );

    for (const matches of owners) expect(matches).toHaveLength(1);
    const exclusive = owners[0]![0]!;
    expect(owners[1]![0]).toBe(exclusive);
    expect(exclusive.fileParallelism).toBe(false);
    for (const project of projects) {
      if (project !== exclusive) {
        expect(exclusive.sequence?.groupOrder).toBeGreaterThan(
          project.sequence?.groupOrder ?? 0,
        );
      }
    }
    for (const script of [
      packageJson.scripts.test,
      packageJson.scripts["test:watch"],
      readFileSync(
        new URL(
          "../../../../../.github/workflows/pipeline.yml",
          import.meta.url,
        ),
        "utf8",
      ),
    ]) {
      expect(script).toContain(`--project ${exclusive.name}`);
    }
  });
});
