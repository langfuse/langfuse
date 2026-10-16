// The OTel ingestion pipeline (events_full-aligned, parse-once JSON type),
// declared as typed stages and compiled to SQL.
// Generate: node pipeline/gen.mjs   -> writes ../sql/transform.generated.sql
// Typecheck: pnpm exec tsc --noEmit --strict ... pipeline/*.ts (see README)
import {
  Pipeline,
  arraySum,
  arrLit,
  col,
  greatestF,
  locals,
  mapFilterF,
  numLit,
  strLength,
  toMap,
  toUInt64,
  arrayJoin,
  castTo,
  extractRe,
  ifNull_,
  indexOfF,
  jsonArr,
  jsonTyped,
  lit,
  match,
  now64,
  nullIf_,
  pick,
  toUInt8,
  arrayElement,
} from "./core.ts";
import { arrayMap, plus, when } from "./core.ts";
import {
  MEDIA_DETECT_RE,
  kvDoubleValues,
  kvIntValues,
  kvKeys,
  kvStringValues,
  mediaIntermediates,
  mediaProjection,
  metadataArrays,
  nanosToDateTime64,
  otelId,
  otelNanos,
} from "./otel.ts";

const LIFTED_KEYS = [
  "langfuse.observation.input",
  "langfuse.observation.output",
  "langfuse.observation.type",
  "langfuse.observation.level",
  "gen_ai.request.model",
  "langfuse.user.id",
  "langfuse.session.id",
  "langfuse.trace.name",
  "langfuse.release",
  "langfuse.version",
  "langfuse.prompt.name",
  "langfuse.prompt.version",
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.output_tokens",
  "gen_ai.usage.total_tokens",
];

const pipeline = Pipeline.source(
  "resource_spans",
  `s3('{URL}', '{S3_ACCESS_KEY}', '{S3_SECRET_KEY}', 'JSONAsObject', 'json JSON')`,
  {
    rs: col<"JSON">("json"),
    source_file: col<"String">("_path"),
    project_id: extractRe(col<"String">("_path"), "otel-poc[^/]*/([^/]+)/"),
  },
)
  .stage("scopes", (s) => ({
    ...pick(s, "source_file", "project_id"),
    res_keys: kvKeys(jsonArr(s.rs, "resource.attributes")),
    res_vals: kvStringValues(jsonArr(s.rs, "resource.attributes")),
    ss: arrayJoin(jsonArr(s.rs, "scopeSpans")),
  }))
  .stage("spans", (s) => ({
    ...pick(s, "source_file", "project_id", "res_keys", "res_vals"),
    scope_name: ifNull_(jsonTyped(s.ss, "scope.name", "String"), lit("")),
    scope_version: ifNull_(jsonTyped(s.ss, "scope.version", "String"), lit("")),
    sp: arrayJoin(jsonArr(s.ss, "spans")),
  }))
  .stage("parsed", (s) => ({
    ...pick(
      s,
      "source_file",
      "project_id",
      "res_keys",
      "res_vals",
      "scope_name",
      "scope_version",
    ),
    trace_id: otelId(s.sp, "traceId"),
    span_id: otelId(s.sp, "spanId"),
    parent_span_id: otelId(s.sp, "parentSpanId"),
    start_ns: otelNanos(s.sp, "startTimeUnixNano"),
    end_ns: otelNanos(s.sp, "endTimeUnixNano"),
    name: ifNull_(jsonTyped(s.sp, "name", "String"), lit("")),
    span_kind: toUInt8(ifNull_(jsonTyped(s.sp, "kind", "Int64"), numLit(0))),
    status_message: ifNull_(
      jsonTyped(s.sp, "status.message", "String"),
      lit(""),
    ),
    attr_keys: kvKeys(jsonArr(s.sp, "attributes")),
    attr_vals: kvStringValues(jsonArr(s.sp, "attributes")),
    attr_ivals: kvIntValues(jsonArr(s.sp, "attributes")),
    attr_dvals: kvDoubleValues(jsonArr(s.sp, "attributes")),
  }))
  .stage("enriched", (s) => {
    const val = (k: string) =>
      arrayElement(s.attr_vals, indexOfF(s.attr_keys, k));
    const ival = (k: string) =>
      arrayElement(s.attr_ivals, indexOfF(s.attr_keys, k));
    const rval = (k: string) =>
      arrayElement(s.res_vals, indexOfF(s.res_keys, k));
    const usage = (k: string) => toUInt64(greatestF(ival(k), 0));
    return {
      ...pick(s, "project_id", "scope_name", "scope_version"),
      trace_id: s.trace_id,
      span_id: s.span_id,
      parent_span_id: s.parent_span_id,
      start_time: nanosToDateTime64(s.start_ns),
      end_time: nanosToDateTime64(s.end_ns),
      name: s.name,
      span_kind: s.span_kind,
      status_message: s.status_message,
      type: val("langfuse.observation.type"),
      service_name: rval("service.name"),
      service_version: rval("service.version"),
      telemetry_sdk_language: rval("telemetry.sdk.language"),
      telemetry_sdk_name: rval("telemetry.sdk.name"),
      telemetry_sdk_version: rval("telemetry.sdk.version"),
      environment: when(rval("deployment.environment").isEmpty())
        .then("default")
        .otherwise(rval("deployment.environment")),
      provided_model_name: val("gen_ai.request.model"),
      user_id: val("langfuse.user.id"),
      session_id: val("langfuse.session.id"),
      trace_name: val("langfuse.trace.name"),
      release: val("langfuse.release"),
      version: val("langfuse.version"),
      level: val("langfuse.observation.level"),
      prompt_name: val("langfuse.prompt.name"),
      prompt_version: castTo(
        nullIf_(ival("langfuse.prompt.version"), 0),
        "Nullable(UInt16)",
      ),
      provided_usage_details: mapFilterF(
        (_k, v) => v.neq(0),
        toMap(
          arrLit<"String">(["input", "output", "total"]),
          arrLit<"UInt64">([
            usage("gen_ai.usage.input_tokens"),
            usage("gen_ai.usage.output_tokens"),
            usage("gen_ai.usage.total_tokens"),
          ]),
          "Map(LowCardinality(String), UInt64)",
        ),
      ),
      input_raw: val("langfuse.observation.input"),
      output: val("langfuse.observation.output"),
      is_media_candidate: toUInt8(
        match(val("langfuse.observation.input"), MEDIA_DETECT_RE),
      ),
      ...metadataArrays(
        {
          keys: s.attr_keys,
          vals: s.attr_vals,
          ivals: s.attr_ivals,
          dvals: s.attr_dvals,
        },
        LIFTED_KEYS,
      ),
      source_file: s.source_file,
    };
  })
  .stage("media", (s) => ({
    ...pick(
      s,
      "project_id",
      "trace_id",
      "span_id",
      "parent_span_id",
      "start_time",
      "end_time",
      "name",
      "type",
      "environment",
      "version",
      "release",
      "trace_name",
      "user_id",
      "session_id",
      "level",
      "status_message",
      "prompt_name",
      "prompt_version",
      "provided_model_name",
      "provided_usage_details",
      "output",
      "metadata_names",
      "metadata_values",
      "scope_name",
      "scope_version",
      "service_name",
      "service_version",
      "telemetry_sdk_language",
      "telemetry_sdk_name",
      "telemetry_sdk_version",
      "span_kind",
      "source_file",
    ),
    ...mediaIntermediates(s.input_raw, s.is_media_candidate),
  }))
  .stage("final", (s) => {
    const media = mediaProjection(s);
    const out = locals({ input: media.input });
    return {
      ...pick(
        s,
        "project_id",
        "trace_id",
        "span_id",
        "parent_span_id",
        "start_time",
        "end_time",
        "name",
        "type",
        "environment",
        "version",
        "release",
        "trace_name",
        "user_id",
        "session_id",
        "level",
        "status_message",
        "prompt_name",
        "prompt_version",
        "provided_model_name",
        "provided_usage_details",
      ),
      usage_details: s.provided_usage_details,
      ...out.defs,
      output: s.output,
      ...pick(s, "metadata_names", "metadata_values"),
      source: lit("otel"),
      ...pick(
        s,
        "service_name",
        "service_version",
        "scope_name",
        "scope_version",
        "telemetry_sdk_language",
        "telemetry_sdk_name",
        "telemetry_sdk_version",
      ),
      blob_storage_file_path: s.source_file,
      event_bytes: toUInt64(
        plus(
          strLength(out.ref.input),
          strLength(s.output),
          strLength(s.name),
          arraySum(arrayMap((x) => strLength(x), s.metadata_values)),
        ),
      ),
      event_ts: now64(6),
      span_kind: s.span_kind,
      has_media: media.has_media,
      media_manifest: media.media_manifest,
    };
  });

export const sql: string = pipeline.compile({
  insertInto: "{STAGING}",
  settings: { log_comment: "poc-chlb-transform-v2" },
});
