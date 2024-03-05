import { Transform, type TransformCallback } from "stream";

import { type ObservationViewWithScores } from "@/src/server/api/routers/generations/getAllQuery";
import { intervalInSeconds } from "@/src/utils/dates";

export function transformStreamToJson(): Transform {
  let isFirstElement = true;

  return new Transform({
    objectMode: true,

    transform(
      row: ObservationViewWithScores,
      encoding: BufferEncoding,
      callback: TransformCallback,
    ): void {
      if (isFirstElement) {
        this.push("["); // Push the opening bracket for the first element
        isFirstElement = false; // Reset the flag after the first element
      } else {
        this.push(","); // For subsequent elements, prepend a comma
      }
      const {
        calculatedInputCost,
        calculatedOutputCost,
        calculatedTotalCost,
        latency,
        ...rest
      } = row;

      const rowToPush = {
        ...rest,
        calculatedInputCost: calculatedInputCost?.toNumber() ?? null,
        calculatedOutputCost: calculatedOutputCost?.toNumber() ?? null,
        calculatedTotalCost: calculatedTotalCost?.toNumber() ?? null,
        latency: latency,
        latencyPerToken:
          row.latency && row.totalTokens !== 0
            ? row.latency / row.totalTokens
            : null,
        timeToFirstToken: row.completionStartTime
          ? intervalInSeconds(row.startTime, row.completionStartTime)
          : null,
      };

      this.push(JSON.stringify(rowToPush)); // Push the current row as a JSON string

      callback();
    },

    // 'final' is called when there is no more data to be consumed, but before the stream is finished.
    final(callback: TransformCallback): void {
      if (isFirstElement) {
        // If no rows were processed, the opening bracket has not been pushed yet.
        this.push("[]"); // Push an empty array to ensure valid JSON.
      } else {
        this.push("]"); // Close JSON array
      }

      callback();
    },
  });
}
