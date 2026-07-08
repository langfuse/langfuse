import { Transform, type TransformCallback } from "stream";
import { stringify } from "./stringify";

export function transformStreamToJsonl(): Transform {
  return new Transform({
    objectMode: true,

    transform(
      row: Record<string, any>,
      encoding: BufferEncoding,
      callback: TransformCallback,
    ): void {
      this.push(stringify(row) + "\n");
      callback();
    },
  });
}
