export enum LangfuseOtelSpanAttributes {
  // Langfuse-Trace attributes
  TRACE_NAME = "langfuse.trace.name",
  TRACE_USER_ID = "user.id",
  TRACE_SESSION_ID = "session.id",
  TRACE_TAGS = "langfuse.trace.tags",
  TRACE_PUBLIC = "langfuse.trace.public",
  TRACE_METADATA = "langfuse.trace.metadata",
  TRACE_INPUT = "langfuse.trace.input",
  TRACE_OUTPUT = "langfuse.trace.output",

  // Langfuse-observation attributes
  OBSERVATION_TYPE = "langfuse.observation.type",
  OBSERVATION_METADATA = "langfuse.observation.metadata",
  OBSERVATION_LEVEL = "langfuse.observation.level",
  OBSERVATION_STATUS_MESSAGE = "langfuse.observation.status_message",
  OBSERVATION_INPUT = "langfuse.observation.input",
  OBSERVATION_OUTPUT = "langfuse.observation.output",

  // Langfuse-observation of type Generation attributes
  OBSERVATION_COMPLETION_START_TIME = "langfuse.observation.completion_start_time",
  OBSERVATION_MODEL = "langfuse.observation.model.name",
  OBSERVATION_MODEL_PARAMETERS = "langfuse.observation.model.parameters",
  OBSERVATION_USAGE_DETAILS = "langfuse.observation.usage_details",
  OBSERVATION_COST_DETAILS = "langfuse.observation.cost_details",
  OBSERVATION_PROMPT_NAME = "langfuse.observation.prompt.name",
  OBSERVATION_PROMPT_VERSION = "langfuse.observation.prompt.version",

  //   General
  ENVIRONMENT = "langfuse.environment",
  RELEASE = "langfuse.release",
  VERSION = "langfuse.version",

  // Internal
  AS_ROOT = "langfuse.internal.as_root",

  // Compatibility - Map properties that were documented in https://langfuse.com/docs/opentelemetry/get-started#property-mapping,
  // but have a new assignment
  TRACE_COMPAT_USER_ID = "langfuse.user.id",
  TRACE_COMPAT_SESSION_ID = "langfuse.session.id",
}
