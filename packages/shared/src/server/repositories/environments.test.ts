import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "../../env";
import { getEnvironmentsForProject } from "./environments";
import { queryClickhouse } from "./clickhouse";

vi.mock("./clickhouse", () => ({
  queryClickhouse: vi.fn(),
}));

const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;

afterEach(() => {
  vi.mocked(queryClickhouse).mockReset();
  (
    env as { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }
  ).LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
});

describe("getEnvironmentsForProject", () => {
  it("returns legacy environments for legacy table filters in dual mode", async () => {
    (
      env as { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }
    ).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";

    vi.mocked(queryClickhouse).mockImplementation(({ query }) => {
      if (query.includes("FROM traces")) {
        return Promise.resolve([{ environment: "prod" }]);
      }
      if (query.includes("FROM events_core")) {
        return Promise.resolve([{ environment: "PROD" }]);
      }
      return Promise.resolve([]);
    });

    await expect(
      getEnvironmentsForProject({ projectId: "project-id" }),
    ).resolves.toEqual([{ environment: "prod" }, { environment: "default" }]);
  });

  it("returns events environments in events-only mode", async () => {
    (
      env as { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }
    ).LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";

    vi.mocked(queryClickhouse).mockImplementation(({ query }) => {
      if (query.includes("FROM events_core")) {
        return Promise.resolve([{ environment: "PROD" }]);
      }
      return Promise.resolve([]);
    });

    await expect(
      getEnvironmentsForProject({ projectId: "project-id" }),
    ).resolves.toEqual([{ environment: "PROD" }, { environment: "default" }]);
  });
});
