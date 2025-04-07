import { ScoreDataType } from "@prisma/client";

export type TableCount = {
  count: number;
};
export const ScoreSource = {
  ANNOTATION: "ANNOTATION",
  API: "API",
  EVAL: "EVAL",
} as const;

export type ScoreSourceType = (typeof ScoreSource)[keyof typeof ScoreSource];

export type Score = {
  id: string;
  timestamp: Date;
  projectId: string;
  environment: string;
  name: string;
  value: number | null;
  source: ScoreSourceType;
  authorUserId: string | null;
  comment: string | null;
  traceId: string;
  observationId: string | null;
  configId: string | null;
  stringValue: string | null;
  queueId: string | null;
  createdAt: Date;
  updatedAt: Date;
  dataType: ScoreDataType;
};
