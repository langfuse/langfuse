import { describe, expect, it, vi } from "vitest";
import { DatabaseReadStream } from "./DatabaseReadStream";

describe("DatabaseReadStream record limits", () => {
  it.each([
    {
      name: "a limit spanning a partial final page",
      pageSize: 3,
      maxRecords: 5,
      expectedIds: [1, 2, 3, 4, 5],
      expectedCalls: [
        [3, 0],
        [3, 3],
      ],
    },
    {
      name: "a limit smaller than one page",
      pageSize: 5,
      maxRecords: 2,
      expectedIds: [1, 2],
      expectedCalls: [[5, 0]],
    },
    {
      name: "a limit at a page boundary",
      pageSize: 3,
      maxRecords: 6,
      expectedIds: [1, 2, 3, 4, 5, 6],
      expectedCalls: [
        [3, 0],
        [3, 3],
      ],
    },
    {
      name: "no limit",
      pageSize: 3,
      maxRecords: undefined,
      expectedIds: [1, 2, 3, 4, 5, 6, 7],
      expectedCalls: [
        [3, 0],
        [3, 3],
        [3, 6],
        [3, 9],
      ],
    },
    {
      name: "fewer records than the limit",
      pageSize: 3,
      maxRecords: 10,
      expectedIds: [1, 2, 3, 4, 5, 6, 7],
      expectedCalls: [
        [3, 0],
        [3, 3],
        [3, 6],
        [3, 9],
      ],
    },
  ])("streams $name without changing pagination", async (testCase) => {
    const records = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
    }));
    const query = vi.fn(async (pageSize: number, offset: number) => {
      // Some database delegates translate these arguments to a page number.
      const page = Math.floor(offset / pageSize);
      return records.slice(page * pageSize, (page + 1) * pageSize);
    });
    const stream = new DatabaseReadStream(
      query,
      testCase.pageSize,
      testCase.maxRecords,
    );
    const ids: number[] = [];

    for await (const record of stream) {
      ids.push(record.id);
    }

    expect(ids).toEqual(testCase.expectedIds);
    expect(query.mock.calls).toEqual(testCase.expectedCalls);
  });

  it("ends an empty stream after the first query", async () => {
    const query = vi.fn(async () => []);
    const stream = new DatabaseReadStream(query, 3, 5);
    const records: unknown[] = [];

    for await (const record of stream) {
      records.push(record);
    }

    expect(records).toEqual([]);
    expect(query).toHaveBeenCalledExactlyOnceWith(3, 0);
  });
});
