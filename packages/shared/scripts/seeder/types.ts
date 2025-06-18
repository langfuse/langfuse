export interface SeederOptions {
  numberOfDays: number;
  numberOfRuns?: number;
  totalObservations?: number;
}

export interface TraceData {
  id: string;
  name: string;
  input?: string;
  output?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  environment: string;
  public?: boolean;
  bookmarked?: boolean;
  release?: string;
  version?: string;
}

export interface ObservationData {
  id: string;
  traceId: string;
  parentObservationId?: string;
  type: "GENERATION" | "SPAN" | "EVENT";
  name: string;
  input?: string;
  output?: string;
  model?: string;
  modelParameters?: Record<string, any>;
  usageDetails?: Record<string, number>;
  costDetails?: Record<string, number>;
  level?: "DEFAULT" | "DEBUG" | "WARNING" | "ERROR";
  environment: string;
}

export interface ScoreData {
  id: string;
  traceId?: string;
  observationId?: string;
  sessionId?: string;
  name: string;
  value?: number;
  stringValue?: string;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  source: string;
  comment?: string;
  environment: string;
}

export interface DatasetItemInput {
  datasetName: string;
  itemIndex: number;
  item: any;
  runNumber?: number;
}

export interface SeederStrategy {
  name: string;
  generateTraces(projectId: string, config: SeederOptions): TraceData[];
  generateObservations(
    projectId: string,
    traces: TraceData[],
    config: SeederOptions,
  ): ObservationData[];
  generateScores(
    projectId: string,
    traces: TraceData[],
    observations: ObservationData[],
    config: SeederOptions,
  ): ScoreData[];
}

export interface FileContent {
  nestedJson: any;
  heavyMarkdown: string;
  chatMlJson: any;
}
