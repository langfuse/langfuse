import { Transform, type TransformCallback } from "stream";
import { stringify } from "./stringify";

const DELIMITER = ",";

function escapeCsvField(field: string): string {
  // Escape double quotes by doubling them, then wrap in quotes
  return `"${field.replace(/"/g, '""')}"`;
}

export function transformStreamToCsv(): Transform {
  let isFirstChunk = true;
  let headers: string[] = [];

  return new Transform({
    objectMode: true,
    transform(
      row: Record<string, any>,
      encoding: BufferEncoding,
      callback: TransformCallback,
    ): void {
      if (isFirstChunk) {
        // Extract headers from the first object
        headers = Object.keys(row);
        this.push(headers.map(escapeCsvField).join(DELIMITER) + "\n");
        isFirstChunk = false;
      }

      // Convert the object to a CSV line and push it
      const csvRow = headers.map((header) => {
        const field = row[header] ?? "";
        const str = stringify(field, header);
        return escapeCsvField(str);
      });

      this.push(csvRow.join(DELIMITER) + "\n");

      callback();
    },
  });
}
