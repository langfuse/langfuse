import Decimal from "decimal.js";

export type BatchExportSessionsRow = {
  id: string;
  createdAt: Date;
  bookmarked: boolean;
  public: boolean;
  userIds?: string[] | null;
  countTraces?: number | null;
  sessionDuration?: number | null;
  inputCost?: Decimal | null;
  outputCost?: Decimal | null;
  totalCost?: Decimal | null;
  inputTokens?: bigint | null;
  outputTokens?: bigint | null;
  totalTokens?: bigint | null;
  traceTags?: string[] | null;
  totalCount: number;
};

export type BatchExportTracesRow = {
  bookmarked: boolean;
  id: string;
  timestamp: Date;
  name: string;
  userId?: string | null;
  scores?: Record<string, string[] | number[]> | null;
  release?: string | null;
  version?: string | null;
  sessionId?: string | null;
  input?: unknown | null;
  output?: unknown | null;
  metadata?: unknown | null;
  tags: string[];
};
