use opentelemetry::trace::TraceContextExt;
use serde_json::{Map, Value};
use std::{fmt, time::SystemTime};
use tracing::{
    Event, Subscriber,
    field::{Field, Visit},
};
use tracing_subscriber::{
    fmt::{
        FmtContext, FormatEvent, FormattedFields,
        format::{JsonFields, Writer},
    },
    registry::LookupSpan,
};

pub(super) struct Format {
    pub json: bool,
}

impl<S> FormatEvent<S, JsonFields> for Format
where
    S: Subscriber + for<'lookup> LookupSpan<'lookup>,
{
    fn format_event(
        &self,
        context: &FmtContext<'_, S, JsonFields>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> fmt::Result {
        let mut fields = Fields::default();
        if let Some(scope) = context.event_scope() {
            for span in scope.from_root() {
                if let Some(values) = span.extensions().get::<FormattedFields<JsonFields>>()
                    && let Ok(values) =
                        serde_json::from_str::<Map<String, Value>>(values.fields.as_str())
                {
                    fields.0.extend(values);
                }
            }
        }
        event.record(&mut fields);
        let timestamp = chrono::DateTime::<chrono::Utc>::from(SystemTime::now())
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        fields.0.insert("timestamp".into(), timestamp.into());
        fields
            .0
            .insert("level".into(), event.metadata().level().as_str().into());
        fields
            .0
            .insert("target".into(), event.metadata().target().into());
        let current = opentelemetry::Context::current();
        let span = current.span();
        let span_context = span.span_context();
        if span_context.is_valid() {
            fields.0.insert(
                "trace_id".into(),
                span_context.trace_id().to_string().into(),
            );
            fields
                .0
                .insert("span_id".into(), span_context.span_id().to_string().into());
        }
        if self.json {
            writeln!(writer, "{}", Value::Object(fields.0))
        } else {
            for key in ["timestamp", "level", "message"] {
                if let Some(value) = fields.0.remove(key) {
                    write!(writer, "{} ", value.as_str().unwrap_or_default())?;
                }
            }
            for (key, value) in fields.0 {
                if let Some(value) = value.as_str() {
                    write!(writer, "{key}={value} ")?;
                } else {
                    write!(writer, "{key}={value} ")?;
                }
            }
            writeln!(writer)
        }
    }
}

#[derive(Default)]
struct Fields(Map<String, Value>);

impl Visit for Fields {
    fn record_debug(&mut self, field: &Field, value: &dyn fmt::Debug) {
        self.0
            .insert(field.name().into(), format!("{value:?}").into());
    }
    fn record_str(&mut self, field: &Field, value: &str) {
        self.0.insert(field.name().into(), value.into());
    }
    fn record_u64(&mut self, field: &Field, value: u64) {
        self.0.insert(field.name().into(), value.into());
    }
    fn record_i64(&mut self, field: &Field, value: i64) {
        self.0.insert(field.name().into(), value.into());
    }
    fn record_f64(&mut self, field: &Field, value: f64) {
        self.0.insert(field.name().into(), value.into());
    }
    fn record_bool(&mut self, field: &Field, value: bool) {
        self.0.insert(field.name().into(), value.into());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use opentelemetry::trace::TracerProvider;
    use opentelemetry_sdk::trace::{InMemorySpanExporter, SdkTracerProvider};
    use std::{
        io,
        sync::{Arc, Mutex},
    };
    use tracing_subscriber::prelude::*;

    #[derive(Clone)]
    struct Buffer(Arc<Mutex<Vec<u8>>>);
    impl io::Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn json_logs_preserve_types_and_correlate_with_the_active_span() {
        let output = Buffer(Arc::new(Mutex::new(Vec::new())));
        let buffer = output.clone();
        let exporter = InMemorySpanExporter::default();
        let provider = SdkTracerProvider::builder()
            .with_simple_exporter(exporter.clone())
            .build();
        let subscriber = tracing_subscriber::registry()
            .with(
                tracing_subscriber::fmt::layer()
                    .fmt_fields(JsonFields::new())
                    .event_format(Format { json: true })
                    .with_writer(move || buffer.clone()),
            )
            .with(tracing_opentelemetry::layer().with_tracer(provider.tracer("test")));
        tracing::subscriber::with_default(subscriber, || {
            let span = tracing::info_span!("request", request_id = "request-1");
            let _entered = span.enter();
            tracing::info!(
                status = 200_u64,
                duration_ms = 12.5,
                complete = true,
                "gateway request finished"
            );
        });
        let bytes = output.0.lock().unwrap();
        let value: Value = serde_json::from_slice(&bytes).unwrap();
        let spans = exporter.get_finished_spans().unwrap();
        assert_eq!(
            value["trace_id"],
            spans[0].span_context.trace_id().to_string()
        );
        assert_eq!(
            value["span_id"],
            spans[0].span_context.span_id().to_string()
        );
        assert_eq!(value["request_id"], "request-1");
        assert_eq!(value["message"], "gateway request finished");
        assert_eq!(value["status"], 200);
        assert_eq!(value["duration_ms"], 12.5);
        assert_eq!(value["complete"], true);
        assert!(value.get("fields").is_none());
    }
}
