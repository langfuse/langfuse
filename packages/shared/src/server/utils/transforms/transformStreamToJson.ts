import { Transform, type TransformCallback } from "stream";
import { stringify } from "./stringify";

export function transformStreamToJson(): Transform {
  let isFirstElement = true;

  return new Transform({
    objectMode: true,

    transform(
      row: any,
      encoding: BufferEncoding, // eslint-disable-line no-unused-vars
      callback: TransformCallback,
    ): void {
      if (isFirstElement) {
        this.push("["); // Push the opening bracket for the first element
        isFirstElement = false; // Reset the flag after the first element
      } else {
        this.push(","); // For subsequent elements, prepend a comma
      }

      this.push(stringify(row)); // Push the current row as a JSON string

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
