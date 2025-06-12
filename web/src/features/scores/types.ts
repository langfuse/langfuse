import { type AnnotationScoreDataSchema } from "@/src/features/scores/schema";
import { type AnnotateFormSchema } from "@/src/features/scores/schema";
import { type APIScoreV2, type ScoreDataType } from "@langfuse/shared";
import { type z } from "zod/v4";

export type HistogramBin = { binLabel: string; count: number };
export type CategoryCounts = Record<string, number>;
export type ChartBin = { binLabel: string } & CategoryCounts;

export type TimeseriesChartProps = {
  chartData: ChartBin[];
  chartLabels: string[];
  title: string;
  type: "numeric" | "categorical";
  index?: string;
  maxFractionDigits?: number;
};

export type ChartData = {
  chartData: ChartBin[];
  chartLabels: string[];
};

export type ScoreData = {
  key: string;
  name: string;
  dataType: ScoreDataType;
  source: string;
};

// Adapter interface to standardize data transformation
export interface TimeseriesDataTransformer {
  toChartData(): ChartData;
}

export type SessionScoreTarget = {
  type: "session";
  sessionId: string;
};

export type TraceScoreTarget = {
  type: "trace";
  traceId: string;
  observationId?: string;
};

export type ScoreTarget = SessionScoreTarget | TraceScoreTarget;

export type AnnotateDrawerProps<Target extends ScoreTarget> = {
  projectId: string;
  scoreTarget: Target;
  scores: APIScoreV2[];
  emptySelectedConfigIds: string[];
  setEmptySelectedConfigIds: (ids: string[]) => void;
  analyticsData?: {
    type: "trace" | "session";
    source: "TraceDetail" | "SessionDetail" | "AnnotationQueue";
  };
  variant?: "button" | "badge";
  buttonVariant?: "secondary" | "outline";
  hasGroupedButton?: boolean;
  environment?: string;
};

export type AnnotateFormSchemaType = z.infer<typeof AnnotateFormSchema>;
export type AnnotationScoreSchemaType = z.infer<
  typeof AnnotationScoreDataSchema
>;
