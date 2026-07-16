import type { PrismaClient } from "../../db";
import { InvalidRequestError } from "../../errors";
import { describe, expect, it, vi } from "vitest";
import {
  applyCommentFilters,
  COMMENT_FILTER_THRESHOLD,
  validateObjectIdCount,
} from "./commentFilterService";

const commonArgs = {
  projectId: "comment-filter-project",
  objectType: "OBSERVATION" as const,
};

const commentCountFilter = (operator: "=" | ">=" | "<=", value: number) => ({
  type: "number" as const,
  column: "commentCount",
  operator,
  value,
});

const commentContentFilter = (value: string) => ({
  type: "string" as const,
  column: "commentContent",
  operator: "contains" as const,
  value,
});

const objectIdFilter = (operator: "any of" | "none of", value: string[]) => ({
  type: "stringOptions" as const,
  column: "id",
  operator,
  value,
});

const createPrisma = (...queryResults: Array<Array<{ object_id: string }>>) => {
  const queryRaw = vi.fn();
  queryResults.forEach((result) => queryRaw.mockResolvedValueOnce(result));

  return {
    prisma: { $queryRaw: queryRaw } as unknown as PrismaClient,
    queryRaw,
  };
};

describe("applyCommentFilters", () => {
  it("removes an unbounded zero-inclusive count filter without excluding uncommented events", async () => {
    const { prisma, queryRaw } = createPrisma();

    const result = await applyCommentFilters({
      filterState: [commentCountFilter(">=", 0)],
      prisma,
      ...commonArgs,
    });

    expect(result).toEqual({
      filterState: [],
      hasNoMatches: false,
      matchingIds: null,
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("applies content filtering when an unbounded count filter includes zero", async () => {
    const matchingIds = ["observation-with-matching-comment"];
    const { prisma, queryRaw } = createPrisma(
      matchingIds.map((object_id) => ({ object_id })),
    );

    const result = await applyCommentFilters({
      filterState: [
        commentCountFilter(">=", 0),
        commentContentFilter("needs-review"),
      ],
      prisma,
      ...commonArgs,
    });

    expect(result).toEqual({
      filterState: [objectIdFilter("any of", matchingIds)],
      hasNoMatches: false,
      matchingIds,
    });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it.each([
    { operator: "<=" as const, value: 1 },
    { operator: "=" as const, value: 0 },
  ])(
    "expresses a zero-inclusive $operator $value count filter as an exclusion",
    async ({ operator, value }) => {
      const excludedIds = ["observation-outside-count-range"];
      const { prisma } = createPrisma(
        excludedIds.map((object_id) => ({ object_id })),
      );

      const result = await applyCommentFilters({
        filterState: [commentCountFilter(operator, value)],
        prisma,
        ...commonArgs,
      });

      expect(result).toEqual({
        filterState: [objectIdFilter("none of", excludedIds)],
        hasNoMatches: false,
        matchingIds: null,
      });
    },
  );

  it.each([
    {
      name: "applies an equality count filter that excludes zero",
      filters: [commentCountFilter("=", 1)],
      queryResults: [[{ object_id: "observation-with-one-comment" }]],
      matchingIds: ["observation-with-one-comment"],
    },
    {
      name: "intersects an equality count filter with comment content",
      filters: [
        commentCountFilter("=", 1),
        commentContentFilter("needs-review"),
      ],
      queryResults: [
        [
          { object_id: "matching-observation" },
          { object_id: "count-only-observation" },
        ],
        [
          { object_id: "matching-observation" },
          { object_id: "content-only-observation" },
        ],
      ],
      matchingIds: ["matching-observation"],
    },
    {
      name: "intersects multiple comment content filters",
      filters: [
        commentContentFilter("urgent"),
        commentContentFilter("customer"),
      ],
      queryResults: [
        [
          { object_id: "matching-observation" },
          { object_id: "first-content-only" },
        ],
        [
          { object_id: "matching-observation" },
          { object_id: "second-content-only" },
        ],
      ],
      matchingIds: ["matching-observation"],
    },
    {
      name: "intersects multiple content filters with a bounded count filter",
      filters: [
        commentCountFilter("<=", 1),
        commentContentFilter("urgent"),
        commentContentFilter("customer"),
      ],
      queryResults: [
        [{ object_id: "observation-outside-count-range" }],
        [
          { object_id: "matching-observation" },
          { object_id: "first-content-only" },
          { object_id: "observation-outside-count-range" },
        ],
        [
          { object_id: "matching-observation" },
          { object_id: "second-content-only" },
        ],
      ],
      matchingIds: ["matching-observation"],
    },
    {
      name: "applies all lower bounds when only some include zero",
      filters: [commentCountFilter(">=", 0), commentCountFilter(">=", 1)],
      queryResults: [
        [
          { object_id: "matching-observation" },
          { object_id: "first-query-only" },
        ],
        [{ object_id: "matching-observation" }],
      ],
      matchingIds: ["matching-observation"],
    },
  ])("$name", async ({ filters, queryResults, matchingIds }) => {
    const { prisma, queryRaw } = createPrisma(...queryResults);

    const result = await applyCommentFilters({
      filterState: filters,
      prisma,
      ...commonArgs,
    });

    expect(result).toEqual({
      filterState: [objectIdFilter("any of", matchingIds)],
      hasNoMatches: false,
      matchingIds,
    });
    expect(queryRaw).toHaveBeenCalledTimes(queryResults.length);
  });
});

describe("validateObjectIdCount", () => {
  it("rejects matches above the 50,000-ID guard with a user-facing error", () => {
    const validate = () =>
      validateObjectIdCount(
        Array<string>(COMMENT_FILTER_THRESHOLD + 1).fill("observation-id"),
        "OBSERVATION",
      );

    expect(validate).toThrow(InvalidRequestError);
    expect(validate).toThrow(
      "Comment filter matches 50,001 observations (limit: 50,000). Please add additional filters to narrow your search.",
    );
  });
});
