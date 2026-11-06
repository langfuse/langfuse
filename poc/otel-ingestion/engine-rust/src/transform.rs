//! The transform: one raw batch payload (a JSON array of resourceSpans —
//! that it arrives as an S3 object is the caller's business) -> events rows.
//! Same scope as sql/transform-v2.sql, written as straight-line Rust — this
//! is the "lambda" a Path B worker owns.

use std::fmt::Write as _;
use std::sync::LazyLock;

use base64::engine::general_purpose::{STANDARD, URL_SAFE};
use base64::Engine as _;
use regex::Regex;
use sha2::{Digest, Sha256};

use crate::otel::{for_each_resource_span, Id, KeyValue, Lenient, Span};
use crate::row::{EventRow, MediaRef};

const METADATA_PREFIX: &str = "langfuse.observation.metadata.";

/// Transform one batch: rows are handed to `sink` the moment they exist and
/// resourceSpans are dropped one at a time (see for_each_resource_span), so
/// peak memory stays at raw bytes + one resourceSpan no matter how large the
/// batch grows.
pub fn transform_batch(
    project_id: &str,
    blob_path: &str,
    bytes: &[u8],
    sink: &mut dyn FnMut(EventRow),
) -> anyhow::Result<()> {
    for_each_resource_span(bytes, |rs| {
        let res = ResourceFields::from_attributes(rs.resource.into_inner().attributes);
        for ss in rs.scope_spans {
            let scope = ss.scope.into_inner();
            let scope_name = scope.name.into_inner();
            let scope_version = scope.version.into_inner();
            for span in ss.spans {
                sink(span_to_row(
                    span,
                    &res,
                    &scope_name,
                    &scope_version,
                    project_id,
                    blob_path,
                ));
            }
        }
    })?;
    Ok(())
}

/// Collecting wrapper around the streaming transform (tests and benches).
#[cfg(test)]
pub fn transform_collect(
    project_id: &str,
    blob_path: &str,
    bytes: &[u8],
) -> anyhow::Result<Vec<EventRow>> {
    let mut rows = Vec::new();
    transform_batch(project_id, blob_path, bytes, &mut |row| rows.push(row))?;
    Ok(rows)
}

/// Resource-level fields lifted into every row of the file.
#[derive(Default)]
struct ResourceFields {
    service_name: String,
    service_version: String,
    telemetry_sdk_language: String,
    telemetry_sdk_name: String,
    telemetry_sdk_version: String,
    environment: String,
}

impl ResourceFields {
    fn from_attributes(attrs: Vec<Lenient<KeyValue>>) -> Self {
        let mut f = Self::default();
        for kv in attrs {
            let kv = kv.into_inner();
            let sval = kv.value.into_inner().string_value.into_inner();
            match kv.key.into_inner().as_str() {
                "service.name" => f.service_name = sval,
                "service.version" => f.service_version = sval,
                "telemetry.sdk.language" => f.telemetry_sdk_language = sval,
                "telemetry.sdk.name" => f.telemetry_sdk_name = sval,
                "telemetry.sdk.version" => f.telemetry_sdk_version = sval,
                "deployment.environment" => f.environment = sval,
                _ => {}
            }
        }
        if f.environment.is_empty() {
            f.environment = "default".to_owned();
        }
        f
    }
}

/// Span-level attributes lifted into dedicated columns; the match arms in
/// span_to_row are the single source of truth for which keys are lifted.
#[derive(Default)]
struct Lifted {
    observation_type: String,
    provided_model_name: String,
    user_id: String,
    session_id: String,
    trace_name: String,
    release: String,
    version: String,
    level: String,
    prompt_name: String,
    prompt_version: i64,
    usage_input: i64,
    usage_output: i64,
    usage_total: i64,
    input: String,
    output: String,
}

fn span_to_row(
    span: Span,
    res: &ResourceFields,
    scope_name: &str,
    scope_version: &str,
    project_id: &str,
    blob_path: &str,
) -> EventRow {
    let start_ns = span.start_time_unix_nano.map_or(0, |v| v.as_u64());
    let end_ns = span.end_time_unix_nano.map_or(0, |v| v.as_u64());
    let name = span.name.into_inner();

    let mut lifted = Lifted::default();
    let mut metadata_names: Vec<String> = Vec::new();
    let mut metadata_values: Vec<String> = Vec::new();

    for kv in span.attributes {
        let kv = kv.into_inner();
        let v = kv.value.into_inner();
        // the three typed lanes, exactly as the SQL reads them
        let sval = v.string_value.into_inner();
        let ival = v.int_value.map_or(0, |x| x.as_i64());
        let dval = v.double_value.into_inner();
        let key = kv.key.into_inner();

        match key.as_str() {
            "langfuse.observation.type" => lifted.observation_type = sval,
            "gen_ai.request.model" => lifted.provided_model_name = sval,
            "langfuse.user.id" => lifted.user_id = sval,
            "langfuse.session.id" => lifted.session_id = sval,
            "langfuse.trace.name" => lifted.trace_name = sval,
            "langfuse.release" => lifted.release = sval,
            "langfuse.version" => lifted.version = sval,
            "langfuse.observation.level" => lifted.level = sval,
            "langfuse.prompt.name" => lifted.prompt_name = sval,
            "langfuse.observation.input" => lifted.input = sval,
            "langfuse.observation.output" => lifted.output = sval,
            "langfuse.prompt.version" => lifted.prompt_version = ival,
            "gen_ai.usage.input_tokens" => lifted.usage_input = ival,
            "gen_ai.usage.output_tokens" => lifted.usage_output = ival,
            "gen_ai.usage.total_tokens" => lifted.usage_total = ival,
            _ => {
                metadata_names.push(key.strip_prefix(METADATA_PREFIX).unwrap_or(&key).to_owned());
                metadata_values.push(if !sval.is_empty() {
                    sval
                } else if ival != 0 {
                    ival.to_string()
                } else if dval != 0.0 {
                    format!("{dval}")
                } else {
                    String::new()
                });
            }
        }
    }

    let (input, media_manifest) = extract_media(lifted.input);

    let usage: Vec<(String, u64)> = [
        ("input", lifted.usage_input),
        ("output", lifted.usage_output),
        ("total", lifted.usage_total),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_owned(), v.max(0) as u64))
    .filter(|(_, v)| *v != 0)
    .collect();

    let event_bytes = (input.len()
        + lifted.output.len()
        + name.len()
        + metadata_values.iter().map(String::len).sum::<usize>()) as u64;

    EventRow {
        project_id: project_id.to_owned(),
        trace_id: span.trace_id.map(Id::into_hex).unwrap_or_default(),
        span_id: span.span_id.map(Id::into_hex).unwrap_or_default(),
        parent_span_id: span.parent_span_id.map(Id::into_hex).unwrap_or_default(),
        start_time: start_ns as i64 / 1000,
        end_time: Some(end_ns as i64 / 1000),
        name,
        observation_type: lifted.observation_type,
        environment: res.environment.clone(),
        version: lifted.version,
        release: lifted.release,
        trace_name: lifted.trace_name,
        user_id: lifted.user_id,
        session_id: lifted.session_id,
        level: lifted.level,
        status_message: span.status.into_inner().message.into_inner(),
        prompt_name: lifted.prompt_name,
        prompt_version: (lifted.prompt_version != 0).then_some(lifted.prompt_version as u16),
        provided_model_name: lifted.provided_model_name,
        provided_usage_details: usage.clone(),
        usage_details: usage,
        input,
        output: lifted.output,
        metadata_names,
        metadata_values,
        source: "otel".to_owned(),
        service_name: res.service_name.clone(),
        service_version: res.service_version.clone(),
        scope_name: scope_name.to_owned(),
        scope_version: scope_version.to_owned(),
        telemetry_sdk_language: res.telemetry_sdk_language.clone(),
        telemetry_sdk_name: res.telemetry_sdk_name.clone(),
        telemetry_sdk_version: res.telemetry_sdk_version.clone(),
        blob_storage_file_path: blob_path.to_owned(),
        event_bytes,
        span_kind: span.kind.into_inner() as u8,
        has_media: u8::from(!media_manifest.is_empty()),
        media_manifest,
    }
}

static MEDIA_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"data:([a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)").unwrap()
});

/// Cut data URIs out of the field value: each match becomes a media token in
/// the stored payload plus a manifest entry whose offsets point into the
/// ORIGINAL value, so the async uploader can re-slice the raw S3 file.
fn extract_media(input: String) -> (String, Vec<MediaRef>) {
    if !input.contains(";base64,") {
        return (input, Vec::new());
    }
    let mut manifest: Vec<MediaRef> = Vec::new();
    let mut out = String::with_capacity(input.len());
    let mut last = 0usize;
    for caps in MEDIA_RE.captures_iter(&input) {
        let m = caps.get(0).unwrap();
        let content_type = &caps[1];
        let decoded = STANDARD.decode(&caps[2]).unwrap_or_default();
        let media_id = URL_SAFE.encode(Sha256::digest(&decoded));
        out.push_str(&input[last..m.start()]);
        write!(
            out,
            "@@@langfuseMedia:type={content_type}|id={media_id}|source=base64_data_uri@@@"
        )
        .unwrap();
        manifest.push((
            media_id,
            content_type.to_owned(),
            "input".to_owned(),
            m.start() as u32,
            m.len() as u32,
        ));
        last = m.end();
    }
    if manifest.is_empty() {
        return (input, manifest);
    }
    out.push_str(&input[last..]);
    (out, manifest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_extraction_offsets_and_id() {
        // sha256("hello") in urlsafe base64
        let input =
            r#"[{"role":"user","content":"see data:image/png;base64,aGVsbG8= end"}]"#.to_owned();
        let uri_start = input.find("data:").unwrap();
        let (rewritten, manifest) = extract_media(input.clone());

        assert_eq!(manifest.len(), 1);
        let (media_id, content_type, field, off, len) = &manifest[0];
        assert_eq!(media_id, "LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=");
        assert_eq!(content_type, "image/png");
        assert_eq!(field, "input");
        assert_eq!(*off, uri_start as u32);
        assert_eq!(*len, "data:image/png;base64,aGVsbG8=".len() as u32);

        let token =
            format!("@@@langfuseMedia:type=image/png|id={media_id}|source=base64_data_uri@@@");
        assert!(rewritten.contains(&token));
        assert!(!rewritten.contains("data:image/png"));
        // slicing the ORIGINAL at manifest offsets must hit the data URI
        assert_eq!(
            &input[*off as usize..(*off + *len) as usize],
            "data:image/png;base64,aGVsbG8="
        );
    }

    #[test]
    fn media_noop_returns_input_unchanged() {
        let input = "plain text, no media".to_owned();
        let (out, manifest) = extract_media(input.clone());
        assert_eq!(out, input);
        assert!(manifest.is_empty());
    }

    #[test]
    fn metadata_value_lanes_match_sql_precedence() {
        let file = br#"[{
          "resource": {"attributes": []},
          "scopeSpans": [{"scope": {"name": "s", "version": "1"}, "spans": [{
            "traceId": "aa", "spanId": "bb",
            "startTimeUnixNano": "1700000000000000001",
            "endTimeUnixNano": "1700000000000000999",
            "name": "n",
            "attributes": [
              {"key": "langfuse.observation.metadata.region", "value": {"stringValue": "eu"}},
              {"key": "langfuse.observation.metadata.attempt", "value": {"intValue": "2"}},
              {"key": "gen_ai.request.temperature", "value": {"doubleValue": 0.7}},
              {"key": "gen_ai.request.top_p", "value": {"doubleValue": 1}},
              {"key": "langfuse.user.id", "value": {"stringValue": "u1"}}
            ]
          }]}]
        }]"#;
        let rows = transform_collect("p", "b/k.json", file).unwrap();
        assert_eq!(rows.len(), 1);
        let row = &rows[0];
        assert_eq!(
            row.metadata_names,
            [
                "region",
                "attempt",
                "gen_ai.request.temperature",
                "gen_ai.request.top_p"
            ]
        );
        // top_p=1 arrives as an integer token but the shared doubleValue path
        // holds floats too, so ClickHouse types it Float64 and prints "1" —
        // any numeric doubleValue is a float here for the same result
        assert_eq!(row.metadata_values, ["eu", "2", "0.7", "1"]);
        assert_eq!(row.user_id, "u1");
        // ns -> micros truncation
        assert_eq!(row.start_time, 1700000000000000);
        assert_eq!(row.end_time, Some(1700000000000000));
    }

    #[test]
    fn malformed_leaves_degrade_like_sql_nulls() {
        // every leaf here is wrong-typed; none of it may fail the file
        let file = br#"[{
          "resource": {"attributes": [{"key": "service.name", "value": {"stringValue": 123}}]},
          "scopeSpans": [{"scope": 7, "spans": [{
            "traceId": 12345,
            "spanId": {"type": "Buffer", "data": [0, 256]},
            "kind": "SPAN_KIND_SERVER",
            "startTimeUnixNano": "1700000000000000000",
            "name": {"nested": true},
            "status": {"message": 9},
            "attributes": [
              "not an object",
              {"key": "langfuse.user.id", "value": 42},
              {"key": "gen_ai.request.max_tokens", "value": {"intValue": 1.5}},
              {"key": "ok", "value": {"stringValue": "fine"}}
            ]
          }]}]
        }]"#;
        let rows = transform_collect("p", "b/k.json", file).unwrap();
        assert_eq!(rows.len(), 1);
        let row = &rows[0];
        assert_eq!(row.trace_id, "");
        assert_eq!(row.span_id, "");
        assert_eq!(row.span_kind, 0);
        assert_eq!(row.name, "");
        assert_eq!(row.status_message, "");
        assert_eq!(row.service_name, "");
        assert_eq!(row.scope_name, "");
        assert_eq!(row.user_id, ""); // key still lifted, value degraded
                                     // the garbage array element lands as ('','') like the SQL's NULL reads
        assert_eq!(row.metadata_names, ["", "gen_ai.request.max_tokens", "ok"]);
        assert_eq!(row.metadata_values, ["", "", "fine"]);
    }
}
