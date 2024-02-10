import { Transform, type TransformCallback } from "stream";

import { usdFormatter } from "@/src/utils/numbers";

import type { ObservationView } from "@prisma/client";

export function transformStreamToCsv(): Transform {
  let isFirstChunk = true;

  return new Transform({
    objectMode: true,
    transform(
      row: ObservationView,
      encoding: BufferEncoding,
      callback: TransformCallback,
    ): void {
      if (isFirstChunk) {
        // Output the header if it's the first chunk
        const csvHeader = [
          "traceId",
          "name",
          "model",
          "startTime",
          "endTime",
          "cost",
          "prompt",
          "completion",
          "metadata",
        ];

        this.push(csvHeader.join(",") + "\n");

        isFirstChunk = false;
      }

      // Convert the generation object to a CSV line and push it
      const csvRow = [
        row.traceId,
        row.name ?? "",
        row.model ?? "",
        row.startTime.toISOString(),
        row.endTime?.toISOString() ?? "",
        row.calculatedTotalCost
          ? usdFormatter(row.calculatedTotalCost.toNumber(), 2, 8)
          : "",
        JSON.stringify(row.input),
        JSON.stringify(row.output),
        JSON.stringify(row.metadata),
      ].map((field) => {
        const str = typeof field === "string" ? field : String(field);
        return `"${str.replace(/"/g, '""')}"`;
      });

      this.push(csvRow.join(",") + "\n");

      callback();
    },
  });
}
