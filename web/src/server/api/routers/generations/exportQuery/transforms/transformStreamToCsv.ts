import { Transform, type TransformCallback } from "stream";

import { type ObservationViewWithScores } from "@/src/server/api/routers/generations/getAllQuery";
import { formatIntervalSeconds, intervalInSeconds } from "@/src/utils/dates";

export function transformStreamToCsv(): Transform {
  let isFirstChunk = true;

  return new Transform({
    objectMode: true,
    transform(
      row: ObservationViewWithScores,
      encoding: BufferEncoding,
      callback: TransformCallback,
    ): void {
      if (isFirstChunk) {
        // Output the header if it's the first chunk
        const csvHeader = [
          "id",
          "name",
          "traceId",
          "traceName",
          "startTime",
          "endTime",
          "completionStartTime",
          "timeToFirstToken",
          "scores",
          "latency",
          "latencyPerToken",
          "inputCost",
          "outputCost",
          "totalCost",
          "level",
          "statusMessage",
          "model",
          "modelParameters",
          "promptTokens",
          "completionTokens",
          "totalTokens",
          "unit",
          "input",
          "output",
          "metadata",
          "promptName",
          "promptVersion",
        ];

        this.push(csvHeader.join(",") + "\n");

        isFirstChunk = false;
      }
      // Convert the generation object to a CSV line and push it
      const csvRow = [
        row.id,
        row.name ?? "",
        row.traceId,
        row.traceName,
        row.startTime.toISOString(),
        row.endTime?.toISOString() ?? "",
        row.completionStartTime?.toISOString() ?? "",
        // time to first token
        row.completionStartTime
          ? intervalInSeconds(row.startTime, row.completionStartTime).toFixed(2)
          : "",
        row.scores ? JSON.stringify(row.scores) : "",
        row.latency ? formatIntervalSeconds(row.latency).slice(0, -1) : "",
        // latency per token
        row.latency && row.completionTokens !== 0
          ? row.latency / row.completionTokens
          : "",
        row.calculatedInputCost ? row.calculatedInputCost.toNumber() : "",
        row.calculatedOutputCost ? row.calculatedOutputCost.toNumber() : "",
        row.calculatedTotalCost ? row.calculatedTotalCost.toNumber() : "",
        row.level,
        row.statusMessage ?? "",
        row.model ?? "",
        JSON.stringify(row.modelParameters),
        row.promptTokens,
        row.completionTokens,
        row.totalTokens,
        row.unit ?? "",
        JSON.stringify(row.input),
        JSON.stringify(row.output),
        JSON.stringify(row.metadata),
        row.promptName ?? "",
        row.promptVersion ?? "",
      ].map((field) => {
        const str = typeof field === "string" ? field : String(field);
        return `"${str.replace(/"/g, '""')}"`;
      });

      this.push(csvRow.join(",") + "\n");

      callback();
    },
  });
}
