import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("../../db", () => ({ prisma: { scoreConfig: db } }));

import { logger } from "../logger";
import { getScoreConfig, listScoreConfigs } from "./score-configs";

const config = {
  id: "valid-config",
  projectId: "project",
  name: "quality",
  dataType: "NUMERIC",
  isArchived: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};
const invalidConfig = { ...config, id: "invalid-config", name: "" };

describe("score config validation reporting", () => {
  const span = {
    recordException: vi.fn(),
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(trace, "getActiveSpan").mockReturnValue(span as unknown as Span);
    vi.spyOn(logger, "warn").mockImplementation(() => logger);
  });

  afterEach(() => vi.restoreAllMocks());

  it("filters invalid configs with a warning while keeping the request span successful", async () => {
    db.findMany.mockResolvedValue([config, invalidConfig]);
    db.count.mockResolvedValue(2);

    const result = await listScoreConfigs({
      projectId: "project",
      page: 1,
      limit: 10,
    });

    expect(result.data).toEqual([config]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      totalItems: 2,
      totalPages: 1,
    });
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(span.recordException).not.toHaveBeenCalled();
    expect(span.setAttributes).not.toHaveBeenCalled();
    expect(span.setStatus).not.toHaveBeenCalled();
  });

  it("still marks a failed single-config read as an error", async () => {
    db.findUnique.mockResolvedValue(invalidConfig);

    await expect(
      getScoreConfig({ projectId: "project", configId: "invalid-config" }),
    ).rejects.toThrow("Requested score config is corrupted");

    expect(logger.warn).not.toHaveBeenCalled();
    expect(span.recordException).toHaveBeenCalledOnce();
    expect(span.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: SpanStatusCode.ERROR }),
    );
  });
});
