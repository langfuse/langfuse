// Score Cache Types
export type CachedScore = {
  name: string;
  dataType: "NUMERIC" | "CATEGORICAL";
  configId: string;
  traceId: string;
  observationId?: string;
  value: number | null;
  stringValue: string | null;
  comment: string | null;
};
