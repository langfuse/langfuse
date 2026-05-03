import type { ScoreAggregate } from "@langfuse/shared";

export type DatasetRunItemByItemRowData = {
  id: string;
  runAt: Date;
  datasetRunName?: string;
  trace?: {
    traceId: string;
    observationId?: string;
  };
  // i/o not set explicitly, but fetched from the server from the cell
  input?: unknown;
  output?: unknown;
  expectedOutput?: unknown;

  // scores holds grouped column with individual scores
  scores: ScoreAggregate;
  latency?: number;
  totalCost?: string;
};

export type DatasetRunItemByRunRowData = {
  id: string;
  runAt: Date;
  datasetItemId: string;
  datasetItemVersion?: Date;
  trace?: {
    traceId: string;
    observationId?: string;
  };
  // i/o not set explicitly, but fetched from the server from the cell
  input?: unknown;
  output?: unknown;
  expectedOutput?: unknown;

  // scores holds grouped column with individual scores
  scores: ScoreAggregate;
  latency?: number;
  totalCost?: string;
};
