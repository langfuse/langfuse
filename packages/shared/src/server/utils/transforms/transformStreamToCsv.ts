import { Transform, type TransformCallback } from "stream";
import { stringify } from "./stringify";

const DELIMITER = ",";
const CSV_DOUBLE_QUOTE = /"/g;

function escapeCsvField(field: string): string {
  return `"${field.replace(CSV_DOUBLE_QUOTE, '""')}"`;
}

const YIELD_INTERVAL_MS = 50;

export function transformStreamToCsv(): Transform {
  let isFirstChunk = true;
  let headers: string[] = [];
  let processingTimeMs = 0;

  return new Transform({
    objectMode: true,
    transform(
      row: Record<string, any>,
      encoding: BufferEncoding,
      callback: TransformCallback,
    ): void {
      const startTime = Date.now();

      if (isFirstChunk) {
        // Extract headers from the first object
        headers = Object.keys(row);
        this.push(headers.map(escapeCsvField).join(DELIMITER) + "\n");
        isFirstChunk = false;
      }

      // Convert the object to a CSV line and push it
      const values: string[] = new Array(headers.length);
      for (let i = 0; i < headers.length; i++) {
        const field = row[headers[i]] ?? "";
        const str = stringify(field, headers[i]);
        values[i] = escapeCsvField(str);
      }

      this.push(values.join(DELIMITER) + "\n");

      // Accumulate only our processing time (ignores time spent in other tasks during yields)
      processingTimeMs += Date.now() - startTime;

      // Yield to event loop periodically to avoid blocking
      if (processingTimeMs >= YIELD_INTERVAL_MS) {
        processingTimeMs = 0; // Reset after yielding
        setImmediate(callback);
      } else {
        callback();
      }
    },
  });
}
