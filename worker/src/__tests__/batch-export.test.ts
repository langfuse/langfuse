import { randomUUID } from "crypto";
import { expect, test, describe, vi, beforeEach, it } from "vitest";

describe("batch export test suite", () => {
  it("should export observations", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    await createTracesCh([createdTrace]);

    const stream = await getDatabaseReadStream({
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      tableName: "traces",
      cutoffCreatedAt: new Date(),
      filter: [],
      orderBy: { column: "timestamp", order: "DESC" },
    });

    const rows = [];
    for await (const chunk of stream) {
      rows.push(...chunk);
    }

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const exportedTrace = rows.find((t) => t.id === createdTrace.id);
    expect(exportedTrace).toBeTruthy();
    if (!exportedTrace) return;

    expect(exportedTrace.name).toBe("trace-name");
    expect(exportedTrace.userId).toBe("user-1");
    expect(exportedTrace.release).toBe("1.0.0");
    expect(exportedTrace.version).toBe("2.0.0");
    expect(exportedTrace.metadata).toEqual({ key: "value" });
    expect(exportedTrace.tags).toEqual(["tag1", "tag2"]);
  });
});
