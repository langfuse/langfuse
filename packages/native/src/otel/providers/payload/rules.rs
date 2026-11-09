//! Payload keys, event names and field-selection rules for `payload`.
//!
//! Each attribute rule lists `(ordered keys, acceptance predicate)`. It chooses the first
//! existing value accepted by that predicate. Ordinary input/output pairs select both values
//! when either is JavaScript truthy;
//! the other side keeps its original value. Lists define precedence within each family.
//! `payload::provider_payload` orders the families and their custom transformations.
//!
//! Metadata exclusions are listed separately and apply regardless of which provider
//! supplies input/output.

use super::AttributeRule;
use crate::otel::attributes::is_js_truthy;

pub(super) const SDK_IO: [[&str; 2]; 2] = [
    ["langfuse.trace.input", "langfuse.trace.output"],
    ["langfuse.observation.input", "langfuse.observation.output"],
];
pub(in crate::otel::providers) const GENKIT_IO: [&str; 2] = ["genkit:input", "genkit:output"];
pub(super) const AI_INPUT_RULE: AttributeRule = (
    &["ai.prompt.messages", "ai.prompt", "ai.toolCall.args"],
    |_| true,
);
pub(super) const AI_OUTPUT_KEYS: &[&str] = &[
    "ai.response.text",
    "ai.result.text",
    "ai.toolCall.result",
    "ai.response.object",
    "ai.result.object",
    "ai.response.toolCalls",
    "ai.result.toolCalls",
];
pub(super) const FLUE_IO: [AttributeRule; 2] = [
    (
        &[
            "flue.turn.input",
            "flue.tool.arguments",
            "flue.task.prompt",
            "flue.workflow.payload",
        ],
        |value| !value.is_null(),
    ),
    (
        &[
            "flue.turn.output",
            "flue.tool.result",
            "flue.task.result",
            "flue.operation.result",
            "flue.workflow.result",
        ],
        |value| !value.is_null(),
    ),
];
pub(in crate::otel::providers) const VERTEX_IO: [[&str; 2]; 2] = [
    [
        "gcp.vertex.agent.llm_request",
        "gcp.vertex.agent.llm_response",
    ],
    [
        "gcp.vertex.agent.tool_call_args",
        "gcp.vertex.agent.tool_response",
    ],
];
pub(super) const LOGFIRE_IO: [&str; 2] = ["prompt", "all_messages_events"];
pub(super) const LIVEKIT_INPUT_RULE: AttributeRule = (
    &[
        "lk.input_text",
        "lk.pii.input_text",
        "lk.user_transcript",
        "lk.pii.user_transcript",
        "lk.chat_ctx",
        "lk.pii.chat_ctx",
    ],
    |value| !value.is_null(),
);
pub(super) const LIVEKIT_OUTPUT_RULE: AttributeRule = (
    &[
        "lk.function_tool.output",
        "lk.pii.function_tool.output",
        "lk.response.text",
        "lk.pii.response.text",
    ],
    is_js_truthy,
);
pub(super) const DIRECT_IO: [[&str; 2]; 4] = [
    ["mlflow.spanInputs", "mlflow.spanOutputs"],
    ["traceloop.entity.input", "traceloop.entity.output"],
    ["input.value", "output.value"],
    ["input", "output"],
];
pub(super) const PYDANTIC_IO: [&str; 2] = ["pydantic_ai.all_messages", "final_result"];
pub(super) const TOOL_IO: [&str; 2] = ["tool_arguments", "tool_response"];
pub(super) const ANTHROPIC_TOOL_RESULT: &str = "anthropic.tool_result.content";
pub(super) const GEN_AI_IO: [[&str; 2]; 2] = [
    ["gen_ai.input.messages", "gen_ai.output.messages"],
    ["gen_ai.tool.call.arguments", "gen_ai.tool.call.result"],
];
pub(super) const FLATTENED_IO: [[&str; 2]; 2] = [
    ["gen_ai.prompt", "gen_ai.completion"],
    ["llm.input_messages", "llm.output_messages"],
];

pub(super) const LIVEKIT_USER_INPUT: AttributeRule =
    (&["lk.user_input", "lk.pii.user_input"], is_js_truthy);
pub(super) const GEN_AI_DETAIL_EVENT: &str = "gen_ai.client.inference.operation.details";
pub(super) const GEN_AI_INPUT_EVENTS: &[&str] = &[
    "gen_ai.system.message",
    "gen_ai.user.message",
    "gen_ai.assistant.message",
    "gen_ai.tool.message",
];
pub(super) const GEN_AI_OUTPUT_EVENT: &str = "gen_ai.choice";
pub(super) const SEMANTIC_KERNEL_EVENTS: [&str; 2] =
    ["gen_ai.content.prompt", "gen_ai.content.completion"];

pub(super) const GATEWAY_ATTRIBUTES: &[&str] = &[
    "langfuse.trace.name",
    "user.id",
    "session.id",
    "langfuse.trace.tags",
    "langfuse.trace.public",
    "langfuse.trace.metadata",
    "langfuse.trace.input",
    "langfuse.trace.output",
    "langfuse.observation.type",
    "langfuse.observation.metadata",
    "langfuse.observation.level",
    "langfuse.observation.status_message",
    "langfuse.observation.input",
    "langfuse.observation.output",
    "langfuse.observation.skills_available",
    "langfuse.observation.completion_start_time",
    "langfuse.observation.model.name",
    "langfuse.observation.model.parameters",
    "langfuse.observation.usage_details",
    "langfuse.observation.cost_details",
    "langfuse.observation.prompt.name",
    "langfuse.observation.prompt.version",
    "langfuse.environment",
    "langfuse.release",
    "langfuse.version",
    "langfuse.internal.as_root",
    "langfuse.internal.is_app_root",
    "langfuse.user.id",
    "langfuse.session.id",
    "langfuse.experiment.id",
    "langfuse.experiment.name",
    "langfuse.experiment.metadata",
    "langfuse.experiment.description",
    "langfuse.experiment.dataset.id",
    "langfuse.experiment.item.id",
    "langfuse.experiment.item.version",
    "langfuse.experiment.item.metadata",
    "langfuse.experiment.item.root_observation_id",
    "langfuse.experiment.item.expected_output",
    "langfuse.evaluator.id",
    "langfuse.evaluation.rule.id",
    "langfuse.evaluator.execution.is_test",
];
pub(super) const PAYLOAD_GROUPS: &[&[&str]] = &[
    &SDK_IO[0],
    &SDK_IO[1],
    &GENKIT_IO,
    AI_INPUT_RULE.0,
    AI_OUTPUT_KEYS,
    FLUE_IO[0].0,
    FLUE_IO[1].0,
    &VERTEX_IO[0],
    &VERTEX_IO[1],
    &LOGFIRE_IO,
    LIVEKIT_INPUT_RULE.0,
    LIVEKIT_USER_INPUT.0,
    LIVEKIT_OUTPUT_RULE.0,
    &DIRECT_IO[0],
    &DIRECT_IO[1],
    &DIRECT_IO[2],
    &DIRECT_IO[3],
    &PYDANTIC_IO,
    &GEN_AI_IO[0],
    &GEN_AI_IO[1],
    &[
        ANTHROPIC_TOOL_RESULT,
        "events",
        "lk.pii.instructions",
        "lk.pii.function_tool.arguments",
        "lk.pii.response.function_calls",
        "gen_ai.system_instructions",
        "langfuse.observation.skills_available",
    ],
];
pub(super) const PREFIXES: &[&str] = &[
    "gen_ai.prompt",
    "gen_ai.completion",
    "llm.input_messages",
    "llm.output_messages",
    "langfuse.trace.metadata",
    "langfuse.observation.metadata",
    "ai.telemetry.metadata",
];
