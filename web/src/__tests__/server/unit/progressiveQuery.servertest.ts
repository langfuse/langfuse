import { progressiveQuery } from "@/src/server/api/progressiveQuery";
import { type QueryProgress } from "@langfuse/shared";

const progress = (fraction: number): QueryProgress => ({
  readRows: fraction * 100,
  totalRowsToRead: 100,
  readBytes: 0,
  elapsedNs: 0,
  fraction,
});

describe("progressiveQuery", () => {
  it("streams progress before the final result", async () => {
    const events = [];

    for await (const event of progressiveQuery(async (reportProgress) => {
      reportProgress(progress(0.25));
      await Promise.resolve();
      reportProgress(progress(0.75));
      return { observations: ["observation-1"] };
    })) {
      events.push(event);
    }

    expect(events.at(-1)).toEqual({
      type: "result",
      data: { observations: ["observation-1"] },
    });
    expect(events.some((event) => event.type === "progress")).toBe(true);
  });

  it("propagates execution errors without emitting a result", async () => {
    const consume = async () => {
      for await (const _event of progressiveQuery(async (reportProgress) => {
        reportProgress(progress(0.5));
        throw new Error("query failed");
      })) {
        // consume the stream
      }
    };

    await expect(consume()).rejects.toThrow("Internal error.");
  });
});
