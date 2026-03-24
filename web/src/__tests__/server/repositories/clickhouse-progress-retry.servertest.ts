/** @jest-environment node */
jest.mock("../../../../../packages/shared/src/server/clickhouse/client", () => {
  const actual = jest.requireActual(
    "../../../../../packages/shared/src/server/clickhouse/client",
  );
  return {
    ...actual,
    clickhouseClient: jest.fn(),
  };
});

import {
  isRow,
  queryClickhouseWithProgress,
} from "../../../../../packages/shared/src/server/repositories/clickhouse";
import { clickhouseClient } from "../../../../../packages/shared/src/server/clickhouse/client";

describe("queryClickhouseWithProgress retry behavior", () => {
  it("retries retryable transport failures before the stream starts", async () => {
    const mockQuery = jest
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({
        query_id: "query-1",
        response_headers: {},
        stream: async function* () {
          yield [
            {
              json: () => ({
                row: {
                  value: 1,
                },
              }),
            },
          ];
        },
      });

    (clickhouseClient as jest.Mock).mockReturnValue({
      query: mockQuery,
    });

    const events: Array<unknown> = [];
    for await (const event of queryClickhouseWithProgress<{ value: number }>({
      query: "SELECT 1 AS value",
    })) {
      events.push(event);
    }

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(events.some((event) => isRow(event))).toBe(true);
  });
});
