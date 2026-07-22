import type { PrismaClient } from "../../db";
import { InvalidRequestError } from "../../errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as commentsRepository from "../repositories/comments";
import {
  applyCommentFilters,
  COMMENT_FILTER_THRESHOLD,
  validateObjectIdCount,
} from "./commentFilterService";

const prisma = {} as PrismaClient;
const commonArgs = {
  projectId: "comment-filter-project",
  objectType: "OBSERVATION" as const,
  prisma,
};

const count = (operator: "=" | ">=" | "<=", value: number) => ({
  type: "number" as const,
  column: "commentCount",
  operator,
  value,
});

const content = (value: string) => ({
  type: "string" as const,
  column: "commentContent",
  operator: "contains" as const,
  value,
});

const idFilter = (operator: "any of" | "none of", value: string[]) => ({
  type: "stringOptions" as const,
  column: "id",
  operator,
  value,
});

const selection = (matchingIds: string[]) => ({
  filterState: [idFilter("any of", matchingIds)],
  hasNoMatches: false,
  matchingIds,
});

const resolve = (
  filterState: Parameters<typeof applyCommentFilters>[0]["filterState"],
) => applyCommentFilters({ filterState, ...commonArgs });

const mockResults = (
  method: "getObjectIdsByCommentCount" | "getObjectIdsByCommentContent",
  ...results: string[][]
) => {
  const mock = vi.spyOn(commentsRepository, method);
  results.forEach((result) => mock.mockResolvedValueOnce(result));
  return mock;
};

afterEach(() => vi.restoreAllMocks());

describe("applyCommentFilters", () => {
  it("treats an unbounded zero-inclusive count filter as a no-op", async () => {
    const countLookup = mockResults("getObjectIdsByCommentCount");

    await expect(resolve([count(">=", 0)])).resolves.toEqual({
      filterState: [],
      hasNoMatches: false,
      matchingIds: null,
    });
    expect(countLookup).not.toHaveBeenCalled();
  });

  it("still applies content when the count predicate is a no-op", async () => {
    const matchingIds = ["matching-observation"];
    mockResults("getObjectIdsByCommentContent", matchingIds);

    await expect(
      resolve([count(">=", 0), content("needs-review")]),
    ).resolves.toEqual(selection(matchingIds));
  });

  it("expresses an exact zero count as an exclusion", async () => {
    const excludedIds = ["commented-observation"];
    const countLookup = mockResults("getObjectIdsByCommentCount", excludedIds);

    await expect(resolve([count("=", 0)])).resolves.toEqual({
      filterState: [idFilter("none of", excludedIds)],
      hasNoMatches: false,
      matchingIds: null,
    });
    expect(countLookup).toHaveBeenCalledExactlyOnceWith({
      ...commonArgs,
      operator: ">",
      value: 0,
    });
  });

  it("uses the tightest zero-inclusive upper bound", async () => {
    const excludedIds = ["observation-above-tightest-bound"];
    const countLookup = mockResults("getObjectIdsByCommentCount", excludedIds);

    await resolve([count("<=", 10), count("<=", 3)]);

    expect(countLookup).toHaveBeenCalledExactlyOnceWith({
      ...commonArgs,
      operator: ">",
      value: 3,
    });
  });

  it.each([
    {
      name: "treats non-zero equality as inclusion",
      filters: [count("=", 1)],
      countResults: [["matching-observation"]],
      contentResults: [],
    },
    {
      name: "intersects equality with content",
      filters: [count("=", 1), content("needs-review")],
      countResults: [["matching-observation", "count-only"]],
      contentResults: [["matching-observation", "content-only"]],
    },
    {
      name: "intersects every content predicate",
      filters: [content("urgent"), content("customer")],
      countResults: [],
      contentResults: [
        ["matching-observation", "first-only"],
        ["matching-observation", "second-only"],
      ],
    },
    {
      name: "intersects every content predicate with a bounded count",
      filters: [count("<=", 1), content("urgent"), content("customer")],
      countResults: [["outside-count-range"]],
      contentResults: [
        ["matching-observation", "first-only", "outside-count-range"],
        ["matching-observation", "second-only"],
      ],
    },
    {
      name: "applies every lower bound even if one includes zero",
      filters: [count(">=", 0), count(">=", 1)],
      countResults: [
        ["matching-observation", "first-only"],
        ["matching-observation"],
      ],
      contentResults: [],
    },
  ])("$name", async ({ filters, countResults, contentResults }) => {
    const countLookup = mockResults(
      "getObjectIdsByCommentCount",
      ...countResults,
    );
    const contentLookup = mockResults(
      "getObjectIdsByCommentContent",
      ...contentResults,
    );

    await expect(resolve(filters)).resolves.toEqual(
      selection(["matching-observation"]),
    );
    expect(countLookup).toHaveBeenCalledTimes(countResults.length);
    expect(contentLookup).toHaveBeenCalledTimes(contentResults.length);
  });

  it("validates the final content-filter intersection", async () => {
    const broadIds = Array.from(
      { length: COMMENT_FILTER_THRESHOLD + 1 },
      (_, index) => `observation-${index}`,
    );
    const matchingIds = [broadIds[0]!];
    mockResults("getObjectIdsByCommentContent", broadIds, matchingIds);

    await expect(
      resolve([content("broad"), content("narrow")]),
    ).resolves.toEqual(selection(matchingIds));
  });
});

describe("validateObjectIdCount", () => {
  it("throws a user-facing InvalidRequestError above the 50,000-ID guard", () => {
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
