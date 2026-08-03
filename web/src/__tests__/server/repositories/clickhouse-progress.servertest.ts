import {
  queryClickhouse,
  queryClickhouseWithProgress,
  isProgressRow,
  isRow,
  isException,
} from "@langfuse/shared/src/server";

async function getClickhouseMajorVersion(): Promise<number> {
  const rows = await queryClickhouse<{ v: string }>({
    query: "SELECT version() AS v",
  });
  return parseInt(rows[0].v.split(".")[0], 10);
}

describe("queryClickhouseWithProgress", () => {
  it("should yield data rows wrapped in { row: T }", async () => {
    const generator = queryClickhouseWithProgress<{ number: string }>({
      query: "SELECT number FROM system.numbers LIMIT 5",
    });

    const dataRows: { number: string }[] = [];
    for await (const event of generator) {
      if (isRow<{ number: string }>(event)) {
        dataRows.push(event.row);
      }
    }

    expect(dataRows).toHaveLength(5);
    expect(dataRows[0]).toHaveProperty("number");
  });

  it("should yield progress events with expected fields", async () => {
    // Use a larger query to increase the chance of getting progress events.
    // Progress events are not guaranteed for small/fast queries, so we
    // verify the structure only when they appear.
    const generator = queryClickhouseWithProgress<{ n: number }>({
      query: "SELECT number as n FROM system.numbers LIMIT 100000",
    });

    const progressEvents: unknown[] = [];
    const dataRows: unknown[] = [];

    for await (const event of generator) {
      if (isProgressRow(event)) {
        progressEvents.push(event.progress);
      } else if (isRow(event)) {
        dataRows.push(event.row);
      }
    }

    // Data rows should always be present
    expect(dataRows.length).toBe(100000);

    // Progress events may or may not appear depending on query speed.
    // When they do appear, verify their structure.
    for (const p of progressEvents) {
      expect(p).toHaveProperty("read_rows");
      expect(p).toHaveProperty("read_bytes");
      expect(p).toHaveProperty("elapsed_ns");
    }
  });

  it("should yield exception events for errors during streaming", async () => {
    const majorVersion = await getClickhouseMajorVersion();
    if (majorVersion < 25) {
      // JSONEachRowWithProgress does not include exception rows on CH < 25
      return;
    }

    const generator = queryClickhouseWithProgress({
      query: `SELECT throwIf(number = 2, 'memory limit exceeded: would use 10.23 GiB') AS v FROM numbers(10)`,
      clickhouseSettings: { max_block_size: "1" },
    });

    let foundException = false;
    let caughtError = false;

    try {
      for await (const event of generator) {
        if (isException(event)) {
          foundException = true;
          expect(event.exception).toContain("memory limit exceeded");
          break;
        }
      }
    } catch {
      // ClickHouse may throw at HTTP level depending on timing
      caughtError = true;
    }

    // Either the error came as an exception row or was thrown
    expect(foundException || caughtError).toBe(true);
  });
});
