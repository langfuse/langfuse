import { ObservationLevel } from "@langfuse/shared";
import Decimal from "decimal.js";

export type BatchExportTracesRow = {
  bookmarked: boolean;
  id: string;
  timestamp: Date;
  name: string;
  userId?: string | null;
  level?: ObservationLevel | null;
  observationCount?: number | null;
  scores?: Record<string, string[] | number[]> | null;
  latency?: number | null;
  release?: string | null;
  version?: string | null;
  sessionId?: string | null;
  input?: unknown | null;
  output?: unknown | null;
  metadata?: unknown | null;
  tags: string[];
  usage: {
    promptTokens?: bigint | null;
    completionTokens?: bigint | null;
    totalTokens?: bigint | null;
  };
  inputCost?: Decimal | null;
  outputCost?: Decimal | null;
  totalCost?: Decimal | null;
};
