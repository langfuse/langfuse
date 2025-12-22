import { type AnnotationScoreDataSchema } from "@/src/features/scores/schema";
import { type AnnotateFormSchema } from "@/src/features/scores/schema";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import {
  type ScoreSourceType,
  type ScoreDataTypeType,
  type ScoreAggregate,
  type ScoreConfigDomain,
  type ScoreDomain,
  type AggregatableScoreDataType,
  ScoreConfigDataType,
} from "@langfuse/shared";
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
  dataType: ScoreDataTypeType;
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

export type AnnotationScore = {
  id: string | null;
  name: string;
  dataType: AnnotationScoreDataType;
  source: ScoreSourceType;
  value?: number | null;
  stringValue?: string | null;
  configId: string;
  traceId?: string | null;
  observationId?: string | null;
  sessionId?: string | null;
  comment?: string | null;
  timestamp?: Date | null;
};

type AnalyticsData = {
  type: "trace" | "session";
  source:
    | "TraceDetail"
    | "SessionDetail"
    | "AnnotationQueue"
    | "DatasetCompare";
};

export type AnnotateDrawerProps<Target extends ScoreTarget> = {
  projectId: string;
  scoreTarget: Target;
  scores: WithStringifiedMetadata<ScoreDomain>[];
  analyticsData?: AnalyticsData;
  scoreMetadata: {
    projectId: string;
    queueId?: string;
    environment?: string;
  };
  buttonVariant?: "secondary" | "outline";
};

export type AnnotateFormSchemaType = z.infer<typeof AnnotateFormSchema>;
export type AnnotationScoreSchemaType = z.infer<
  typeof AnnotationScoreDataSchema
>;

export type AnnotationScoreDataType = ScoreConfigDataType;
export const ANNOTATION_SCORE_DATA_TYPES_ARRAY =
  Object.values(ScoreConfigDataType);

export type ScoreColumn = {
  key: string;
  name: string;
  source: ScoreSourceType;
  dataType: AggregatableScoreDataType;
};

export type ScoreConfigSelection =
  | { mode: "fixed"; configs: ScoreConfigDomain[] }
  | { mode: "selectable" };

export type AnnotationForm<Target extends ScoreTarget> = {
  scoreTarget: Target;
  serverScores: WithStringifiedMetadata<ScoreDomain>[] | ScoreAggregate;
  scoreMetadata: {
    projectId: string;
    queueId?: string;
    environment?: string;
  };
  configSelection?: ScoreConfigSelection;
  analyticsData?: AnalyticsData;
  actionButtons?: React.ReactNode;
};

export type AnnotationScoreFormData = {
  id: string | null;
  configId: string;
  name: string;
  dataType: AnnotationScoreDataType;
  value?: number | null;
  stringValue?: string | null;
  comment?: string | null;
  timestamp?: Date | null;
};

export type InnerAnnotationFormProps<Target extends ScoreTarget> = {
  scoreTarget: Target;
  initialFormData: AnnotationScoreFormData[];
  configControl: {
    configs: ScoreConfigDomain[];
    allowManualSelection: boolean;
  };
  scoreMetadata: {
    projectId: string;
    queueId?: string;
    environment?: string;
  };
  analyticsData?: AnalyticsData;
  actionButtons?: React.ReactNode;
};
