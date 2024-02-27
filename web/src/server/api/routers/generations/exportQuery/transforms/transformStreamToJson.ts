import { Transform, type TransformCallback } from "stream";

import { type ObservationViewWithScores } from "@/src/server/api/routers/generations/getAllQuery";
import { formatInterval } from "@/src/utils/dates";

type ExportedObservations = ObservationViewWithScores & {
  timeToFirstToken?: string | null;
  latencyPerToken?: number | null;
};

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
      let rowToPush: ExportedObservations = { ...row };

      if (row.completionStartTime) {
        const timeToFirstToken = formatInterval(
          new Date(row.startTime).getTime() -
            new Date(row.completionStartTime).getTime(),
        );
        rowToPush = { ...rowToPush, timeToFirstToken: timeToFirstToken };
      } else {
        rowToPush = { ...rowToPush, timeToFirstToken: null };
      }
      if (row.latency && row.totalTokens !== 0) {
        const latencyPerToken = Number(row.latency) / row.totalTokens;
        rowToPush = { ...rowToPush, latencyPerToken: latencyPerToken };
      } else {
        rowToPush = { ...rowToPush, latencyPerToken: null };
      }

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
