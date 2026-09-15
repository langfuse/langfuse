//! Final facts delivery. A Langfuse exporter can replace this debug sink later.
use crate::capture::InferenceFacts;

pub(crate) fn record(facts: InferenceFacts) {
    // Full mode intentionally includes native request and completed output content.
    tracing::debug!(capture = %format_args!("{:#}", serde_json::to_value(facts).expect("captured facts must serialize")), "gateway response captured");
}
