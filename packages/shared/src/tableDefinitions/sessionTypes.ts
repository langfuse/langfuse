import Decimal from "decimal.js";

type SessionsRowBaseProps = {
  id: string;
  createdAt: string;
  bookmarked: boolean;
  countTraces?: number;
  sessionDuration?: number | null;
  inputCost?: Decimal;
  outputCost?: Decimal;
  totalCost?: Decimal;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type BatchExportSessionsRow = SessionsRowBaseProps & {
  public: boolean;
  userIds?: (string | null)[] | null;
  traceTags?: string[] | null;
  totalCount: number;
};

export type SessionTableRow = SessionsRowBaseProps & {
  traceTags?: string[];
  userIds?: string[];
};
