import { v4 } from "uuid";
import {
  TraceRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
} from "../repositories/definitions";

export const createTrace = (
  trace: Partial<TraceRecordInsertType>,
): TraceRecordInsertType => {
  return {
    id: v4(),
    project_id: v4(),
    session_id: v4(),
    timestamp: Date.now(),
    environment: "default",
    metadata: {
      source: "API",
      server: "Node",
    },
    public: false,
    bookmarked: true,
    name: "test-trace" + v4(),
    tags: ["john", "doe"],
    release: "1.0.0",
    version: "2",
    user_id: v4(),
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
    is_deleted: 0,
    ...trace,
  };
};

export const createObservation = (
  observation: Partial<ObservationRecordInsertType>,
): ObservationRecordInsertType => {
  return {
    id: v4(),
    trace_id: v4(),
    project_id: v4(),
    type: "GENERATION",
    environment: "default",
    metadata: {
      source: "API",
      server: "Node",
    },
    provided_usage_details: { input: 1234, output: 5678, total: 6912 },
    provided_cost_details: { input: 100, output: 200, total: 300 },
    usage_details: { input: 1234, output: 5678, total: 6912 },
    cost_details: { input: 100, output: 200, total: 300 },
    is_deleted: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
    start_time: Date.now(),
    event_ts: Date.now(),
    name: "sample_name" + v4(),
    level: "DEFAULT",
    status_message: "status",
    version: "1.0",
    input: "Hello World",
    output: "Hello John",
    provided_model_name: "gpt-3.5-turbo",
    internal_model_id: v4(),
    model_parameters: '{"something":"sample_param"}',
    total_cost: 300,
    prompt_id: v4(),
    prompt_name: "generation-prompt",
    prompt_version: 1,
    end_time: Date.now(),
    completion_start_time: Date.now(),
    ...observation,
  };
};

export const createTraceScore = (
  score: Partial<ScoreRecordInsertType>,
): ScoreRecordInsertType => {
  return {
    id: v4(),
    project_id: v4(),
    trace_id: v4(),
    observation_id: v4(),
    environment: "default",
    name: "test-score" + v4(),
    timestamp: Date.now(),
    value: 100.5,
    source: "API",
    comment: "comment",
    metadata: { "test-key": "test-value" },
    data_type: "NUMERIC" as const,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
    is_deleted: 0,
    ...score,
    session_id: null,
    dataset_run_id: null,
  };
};

export const createSessionScore = (
  score: Partial<ScoreRecordInsertType>,
): ScoreRecordInsertType => {
  return {
    id: v4(),
    project_id: v4(),
    session_id: v4(),
    environment: "default",
    name: "test-session-score" + v4(),
    timestamp: Date.now(),
    value: 100.5,
    source: "API",
    comment: "comment",
    metadata: { "test-key": "test-value" },
    data_type: "NUMERIC" as const,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
    is_deleted: 0,
    ...score,
    observation_id: null,
    trace_id: null,
    dataset_run_id: null,
  };
};

export const createDatasetRunScore = (
  score: Partial<ScoreRecordInsertType>,
): ScoreRecordInsertType => {
  return {
    id: v4(),
    project_id: v4(),
    dataset_run_id: v4(),
    environment: "default",
    name: "test-run-score" + v4(),
    timestamp: Date.now(),
    value: 100.5,
    source: "API",
    comment: "comment",
    metadata: { "test-key": "test-value" },
    data_type: "NUMERIC" as const,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
    is_deleted: 0,
    ...score,
    observation_id: null,
    trace_id: null,
    session_id: null,
  };
};
