import {
  type AnnotationScoreDataSchema,
  type AnnotateFormSchema,
} from "@/src/features/scores/schema";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import {
  type ScoreSourceType,
  type ScoreDataTypeType,
  type ScoreAggregate,
  type ScoreConfigDomain,
  type ScoreDomain,
  ScoreConfigDataType,
} from "@langfuse/shared";
import { type z } from "zod";

export type CategoryCounts = Record<string, number>;
export type ChartBin = { binLabel: string } & CategoryCounts;

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

type SessionScoreTarget = {
  type: "session";
  sessionId: string;
};

type TraceScoreTarget = {
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

export type AnalyticsData = {
  type: "trace" | "session";
  source:
    | "TraceDetail"
    | "SessionDetail"
    | "AnnotationQueue"
    | "DatasetCompare";
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
  dataType: AnnotationScoreDataType;
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
    emptySelectedConfigIdsStorageKey?: string;
  };
  scoreMetadata: {
    projectId: string;
    queueId?: string;
    environment?: string;
  };
  analyticsData?: AnalyticsData;
  actionButtons?: React.ReactNode;
};
