import { Transform, type TransformCallback } from "stream";

import { type ObservationViewWithScores } from "@/src/server/api/routers/generations/getAllQuery";
import { intervalInSeconds } from "@/src/utils/dates";
import {
  type ObservationType,
  type Prisma,
  type ObservationLevel,
} from "@prisma/client";
import type Decimal from "decimal.js";

type ExportedObservations = {
  id: string;
  traceId: string | null;
  projectId: string;
  type: ObservationType;
  startTime: Date;
  endTime: Date | null;
  name: string | null;
  metadata: Prisma.JsonValue | null;
  parentObservationId: string | null;
  level: ObservationLevel;
  statusMessage: string | null;
  version: string | null;
  createdAt: Date;
  model: string | null;
  modelParameters: Prisma.JsonValue | null;
  input: Prisma.JsonValue | null;
  output: Prisma.JsonValue | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  unit: string | null;
  completionStartTime: Date | null;
  promptId: string | null;
  modelId: string | null;
  inputPrice: Decimal | null;
  outputPrice: Decimal | null;
  totalPrice: Decimal | null;
  calculatedInputCost: number | null;
  calculatedOutputCost: number | null;
  calculatedTotalCost: number | null;
  latency: number | null;
  traceName: string | null;
  promptName: string | null;
  promptVersion: string | null;
  scores: Record<string, number> | null;
  timeToFirstToken?: number | null;
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
      const {
        calculatedInputCost,
        calculatedOutputCost,
        calculatedTotalCost,
        latency,
        ...rest
      } = row;

      const rowToPush: ExportedObservations = {
        ...rest,
        calculatedInputCost: calculatedInputCost?.toNumber() ?? null,
        calculatedOutputCost: calculatedOutputCost?.toNumber() ?? null,
        calculatedTotalCost: calculatedTotalCost?.toNumber() ?? null,
        latency: latency,
        latencyPerToken: null,
        timeToFirstToken: null,
      };

      if (row.completionStartTime) {
        const timeToFirstToken = intervalInSeconds(
          row.startTime,
          row.completionStartTime,
        );
        rowToPush.timeToFirstToken = timeToFirstToken;
      }
      if (row.latency && row.totalTokens !== 0) {
        const latencyPerToken = row.latency / row.totalTokens;
        rowToPush.latencyPerToken = latencyPerToken;
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
