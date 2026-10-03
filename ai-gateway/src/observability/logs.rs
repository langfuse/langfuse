//! JSON span fields are nested, so the request ID is repeated as a top-level
//! `request_id` on every event emitted inside a request, for log search.
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

const REQUEST_ID_FIELD: &str = "gateway.request.id";

struct LoggedRequestId(String);

/// Keeps each span's `gateway.request.id` where [`WithRequestId`] can find it.
pub(crate) struct RequestIdSpans;

impl<S> Layer<S> for RequestIdSpans
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_new_span(&self, attributes: &span::Attributes<'_>, id: &span::Id, ctx: Context<'_, S>) {
        let mut visitor = RequestIdVisitor(None);
        attributes.record(&mut visitor);
        store(id, &ctx, visitor.0);
    }

    fn on_record(&self, id: &span::Id, values: &span::Record<'_>, ctx: Context<'_, S>) {
        let mut visitor = RequestIdVisitor(None);
        values.record(&mut visitor);
        store(id, &ctx, visitor.0);
    }
}

fn store<S>(id: &span::Id, ctx: &Context<'_, S>, request_id: Option<String>)
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    if let (Some(request_id), Some(span)) = (request_id, ctx.span(id)) {
        span.extensions_mut().replace(LoggedRequestId(request_id));
    }
}

struct RequestIdVisitor(Option<String>);

impl Visit for RequestIdVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == REQUEST_ID_FIELD {
            self.0 = Some(value.to_owned());
        }
    }

    fn record_debug(&mut self, _: &Field, _: &dyn fmt::Debug) {}
}

/// Wraps a JSON event formatter and prepends the innermost span's request ID.
pub(crate) struct WithRequestId<F>(pub F);

impl<S, N, F> FormatEvent<S, N> for WithRequestId<F>
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
        let request_id = ctx.event_scope().and_then(|scope| {
            scope.into_iter().find_map(|span| {
                span.extensions()
                    .get::<LoggedRequestId>()
                    .map(|id| id.0.clone())
            })
        });
        let Some(request_id) = request_id else {
            return self.0.format_event(ctx, writer, event);
        };
        let mut line = String::new();
        self.0.format_event(ctx, Writer::new(&mut line), event)?;
        let Some(rest) = line.strip_prefix('{') else {
            return writer.write_str(&line);
        };
        let request_id = serde_json::to_string(&request_id).map_err(|_| fmt::Error)?;
        write!(writer, "{{\"request_id\":{request_id}")?;
        if !rest.starts_with('}') {
            writer.write_char(',')?;
        }
        writer.write_str(rest)
    }
}
