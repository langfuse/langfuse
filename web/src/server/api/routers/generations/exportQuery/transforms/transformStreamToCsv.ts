import { Transform, type TransformCallback } from "stream";

import { type ObservationViewWithScores } from "@/src/server/api/routers/generations/getAllQuery";

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
          "timeToFirstToken",
          "scores",
          "latencyInMilliSeconds",
          "latencyPerTokenInMilliSeconds",
          "inputCostInUSD",
          "outputCostInUSD",
          "totalCostInUSD",
          "level",
          "statusMessage",
          "model",
          "promptTokens",
          "completionTokens",
          "totalTokens",
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
        // time to first token
        row.completionStartTime
          ? new Date(row.startTime).getTime() -
            new Date(row.completionStartTime).getTime()
          : "",
        row.scores ? JSON.stringify(row.scores) : "",
        row.latency ? row.latency : "",
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
        row.promptTokens,
        row.completionTokens,
        row.totalTokens,
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
