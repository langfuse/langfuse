import { Transform, type TransformCallback } from "stream";
import { stringify } from "./stringify";

const DELIMITER = ",";

export function transformStreamToCsv(): Transform {
  let isFirstChunk = true;
  let headers: string[] = [];

  return new Transform({
    objectMode: true,
    transform(
      row: Record<string, any>,
      encoding: BufferEncoding, // eslint-disable-line
      callback: TransformCallback,
    ): void {
      if (isFirstChunk) {
        // Extract headers from the first object
        headers = Object.keys(row);
        this.push(headers.join(DELIMITER) + "\n");
        isFirstChunk = false;
      }

      // Convert the object to a CSV line and push it
      const csvRow = headers.map((header) => {
        const field = row[header] ?? "";
        let str = stringify(field);

        // escape and format fields that contain commas
        if (str.includes(",")) {
          str = `"${str.replace(/"/g, '""')}"`;
        }
        if (str.startsWith('"') && str.endsWith('"')) {
          return str;
        } else {
          return `"${str?.replace(/"/g, '""') ?? ""}"`;
        }
      });

      this.push(csvRow.join(DELIMITER) + "\n");

      callback();
    },
  });
}
