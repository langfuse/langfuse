//! JSON span fields are nested, so the request's correlation fields are repeated
//! as top-level keys, such as `request_id`, on every event emitted inside a
//! request, for log search.
use std::fmt;

use tracing::{
    Event, Subscriber,
    field::{Field, Visit},
    span,
};
use tracing_subscriber::{
    fmt::{FmtContext, FormatEvent, FormatFields, format::Writer},
    layer::{Context, Layer},
    registry::LookupSpan,
};

/// Span field and its top-level log key. All are recorded on the server span.
const CORRELATION_FIELDS: [(&str, &str); 7] = [
    ("gateway.request.id", "request_id"),
    ("langfuse.organization.id", "organization_id"),
    ("langfuse.project.id", "project_id"),
    ("gateway.provider", "provider"),
    ("gateway.provider.connection.id", "provider_connection_id"),
    (
        "gateway.provider.connection.name",
        "provider_connection_name",
    ),
    ("gateway.upstream.model", "upstream_model"),
];

#[derive(Default)]
struct LoggedFields([Option<String>; CORRELATION_FIELDS.len()]);

/// Keeps each span's correlation fields where [`WithCorrelationFields`] can find them.
pub(crate) struct CorrelationSpans;

impl<S> Layer<S> for CorrelationSpans
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_new_span(&self, attributes: &span::Attributes<'_>, id: &span::Id, ctx: Context<'_, S>) {
        let mut visitor = CorrelationVisitor::default();
        attributes.record(&mut visitor);
        store(id, &ctx, visitor);
    }

    fn on_record(&self, id: &span::Id, values: &span::Record<'_>, ctx: Context<'_, S>) {
        let mut visitor = CorrelationVisitor::default();
        values.record(&mut visitor);
        store(id, &ctx, visitor);
    }
}

fn store<S>(id: &span::Id, ctx: &Context<'_, S>, visitor: CorrelationVisitor)
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    if visitor.0.0.iter().all(Option::is_none) {
        return;
    }
    let Some(span) = ctx.span(id) else {
        return;
    };
    let mut extensions = span.extensions_mut();
    if let Some(logged) = extensions.get_mut::<LoggedFields>() {
        for (slot, value) in logged.0.iter_mut().zip(visitor.0.0) {
            if value.is_some() {
                *slot = value;
            }
        }
        return;
    }
    extensions.insert(visitor.0);
}

#[derive(Default)]
struct CorrelationVisitor(LoggedFields);

impl Visit for CorrelationVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        if let Some(index) = CORRELATION_FIELDS
            .iter()
            .position(|(name, _)| *name == field.name())
        {
            self.0.0[index] = Some(value.to_owned());
        }
    }

    fn record_debug(&mut self, _: &Field, _: &dyn fmt::Debug) {}
}

/// Wraps a JSON event formatter and prepends the innermost span's correlation fields.
pub(crate) struct WithCorrelationFields<F>(pub F);

impl<S, N, F> FormatEvent<S, N> for WithCorrelationFields<F>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
    F: FormatEvent<S, N>,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> fmt::Result {
        let fields = ctx.event_scope().and_then(|scope| {
            scope.into_iter().find_map(|span| {
                span.extensions()
                    .get::<LoggedFields>()
                    .map(|fields| fields.0.clone())
            })
        });
        let Some(fields) = fields else {
            return self.0.format_event(ctx, writer, event);
        };
        let mut line = String::new();
        self.0.format_event(ctx, Writer::new(&mut line), event)?;
        let Some(rest) = line.strip_prefix('{') else {
            return writer.write_str(&line);
        };
        writer.write_char('{')?;
        let mut first = true;
        for ((_, key), value) in CORRELATION_FIELDS.iter().zip(fields) {
            let Some(value) = value else {
                continue;
            };
            if !first {
                writer.write_char(',')?;
            }
            first = false;
            let value = serde_json::to_string(&value).map_err(|_| fmt::Error)?;
            write!(writer, "\"{key}\":{value}")?;
        }
        if !first && !rest.starts_with('}') {
            writer.write_char(',')?;
        }
        writer.write_str(rest)
    }
}
