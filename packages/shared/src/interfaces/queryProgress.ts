export type QueryProgress = {
  readRows: number;
  totalRowsToRead: number;
  readBytes: number;
  elapsedNs: number;
  fraction: number;
  phase?: "reading" | "enriching";
};

export type ProgressiveQueryEvent<T> =
  | { type: "progress"; progress: QueryProgress }
  | { type: "result"; data: T };
