import type { PrismaClient } from "../../db";
import { describe, expect, it, vi } from "vitest";
import {
  applyCommentFilters,
  COMMENT_FILTER_THRESHOLD,
} from "./commentFilterService";

describe("applyCommentFilters", () => {
  const projectId = "comment-filter-project";

  it("removes an unbounded zero-inclusive count filter without excluding uncommented events", async () => {
    const prisma = {
      $queryRaw: vi.fn(),
    } as unknown as PrismaClient;

    const result = await applyCommentFilters({
      filterState: [
        {
          type: "number",
          column: "commentCount",
          operator: ">=",
          value: 0,
        },
      ],
      prisma,
      projectId,
      objectType: "OBSERVATION",
    });

    expect(result).toEqual({
      filterState: [],
      hasNoMatches: false,
      matchingIds: null,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("applies content filtering when an unbounded count filter includes zero", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          object_id: "observation-with-matching-comment",
        },
      ]),
    } as unknown as PrismaClient;

    const result = await applyCommentFilters({
      filterState: [
        {
          type: "number",
          column: "commentCount",
          operator: ">=",
          value: 0,
        },
        {
          type: "string",
          column: "commentContent",
          operator: "contains",
          value: "needs-review",
        },
      ],
      prisma,
      projectId,
      objectType: "OBSERVATION",
    });

    expect(result).toEqual({
      filterState: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "id",
          value: ["observation-with-matching-comment"],
        },
      ],
      hasNoMatches: false,
      matchingIds: ["observation-with-matching-comment"],
    });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("expresses a bounded zero-inclusive count filter as an exclusion", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          object_id: "observation-with-too-many-comments",
        },
      ]),
    } as unknown as PrismaClient;

    const result = await applyCommentFilters({
      filterState: [
        {
          type: "number",
          column: "commentCount",
          operator: "<=",
          value: 1,
        },
      ],
      prisma,
      projectId,
      objectType: "OBSERVATION",
    });

    expect(result).toEqual({
      filterState: [
        {
          type: "stringOptions",
          operator: "none of",
          column: "id",
          value: ["observation-with-too-many-comments"],
        },
      ],
      hasNoMatches: false,
      matchingIds: null,
    });
  });

  it("preserves the 50,000-ID guard for Events comment filters", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue(
        Array.from({ length: COMMENT_FILTER_THRESHOLD + 1 }, (_, index) => ({
          object_id: `observation-${index}`,
        })),
      ),
    } as unknown as PrismaClient;

    await expect(
      applyCommentFilters({
        filterState: [
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 1,
          },
        ],
        prisma,
        projectId,
        objectType: "OBSERVATION",
      }),
    ).rejects.toThrow(
      "Comment filter matches 50,001 observations (limit: 50,000)",
    );
  });
});
