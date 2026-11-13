//! Attribute precedence and field mappings for `fields`.
//!
//! Lists are read in order. `require_truthy` skips JavaScript falsy values such as null,
//! false, zero and empty strings. `decode_metadata` marks tag values to parse when the
//! caller enables metadata decoding. AI parameter entries choose the first existing
//! input key and convert its value to a string, preserving null and defaulting to null.
//! Provider-specific conversions and precedence between families are implemented in `fields`.

use super::{NameRule, TagRule};

pub(super) const NAME_RULES: &[NameRule] = &[
    NameRule {
        key: "gen_ai.tool.name",
        require_truthy: true,
    },
    NameRule {
        key: "genkit:name",
        require_truthy: false,
    },
    NameRule {
        key: "logfire.msg",
        require_truthy: true,
    },
    NameRule {
        key: "ai.toolCall.name",
        require_truthy: false,
    },
];

pub(super) const MODEL_NAME_KEYS: &[&str] = &[
    "langfuse.observation.model.name",
    "litellm.provider.model",
    "gen_ai.response.model",
    "ai.model.id",
    "gen_ai.request.model",
    "llm.response.model",
    "llm.model_name",
    "model",
];

pub(super) const AI_PARAM_RULES: &[(&str, &[&str])] = &[
    ("maxSteps", &["ai.settings.maxSteps"]),
    ("toolChoice", &["ai.prompt.toolChoice"]),
    ("maxTokens", &["gen_ai.request.max_tokens"]),
    (
        "finishReason",
        &["gen_ai.response.finish_reasons", "gen_ai.finishReason"],
    ),
    ("system", &["gen_ai.system", "ai.model.provider"]),
    ("maxRetries", &["ai.settings.maxRetries"]),
    ("mode", &["ai.settings.mode"]),
    ("temperature", &["gen_ai.request.temperature"]),
    ("service_tier", &["gen_ai.request.service_tier"]),
];

pub(super) const GENKIT_CONFIG_SOURCES: &[(&str, &[&str])] = &[
    ("genkit:input", &["config"]),
    ("genkit:output", &["request", "config"]),
];

pub(super) const GOOGLE_METADATA_KEYS: &[&str] = &["googleVertex", "vertex", "google"];

pub(super) const LEGACY_PARAM_KEYS: &[&str] = &["llm.invocation_parameters", "model_config"];

pub(super) const PARAM_PREFIXES: &[&str] = &["gen_ai.request.", "llm.invocation_parameters."];

pub(super) const TAG_RULES: &[TagRule] = &[
    TagRule {
        key: "langfuse.trace.tags",
        decode_metadata: false,
        require_truthy: true,
    },
    TagRule {
        key: "langfuse.tags",
        decode_metadata: false,
        require_truthy: true,
    },
    TagRule {
        key: "langfuse.observation.metadata.langfuse_tags",
        decode_metadata: true,
        require_truthy: true,
    },
    TagRule {
        key: "langfuse.trace.metadata.langfuse_tags",
        decode_metadata: true,
        require_truthy: true,
    },
    TagRule {
        key: "ai.telemetry.metadata.tags",
        decode_metadata: false,
        require_truthy: true,
    },
    // The final JS fallback preserves an empty string as a tag.
    TagRule {
        key: "tag.tags",
        decode_metadata: false,
        require_truthy: false,
    },
];

pub(super) const FIRST_CHUNK_MS_KEYS: &[&str] =
    &["ai.response.msToFirstChunk", "ai.stream.msToFirstChunk"];

pub(super) const PROMPT_VERSION_KEYS: &[&str] = &[
    "langfuse.observation.prompt.version",
    "langfuse.prompt.version",
];

pub(super) const PUBLIC_KEYS: &[&str] = &["langfuse.trace.public", "langfuse.public"];

pub(super) const DECLARED_OBSERVATION_TYPES: &[(&str, &[(&str, &str)])] = &[
    (
        "langfuse.observation.type",
        &[
            ("span", "SPAN"),
            ("generation", "GENERATION"),
            ("event", "EVENT"),
            ("embedding", "EMBEDDING"),
            ("agent", "AGENT"),
            ("tool", "TOOL"),
            ("chain", "CHAIN"),
            ("retriever", "RETRIEVER"),
            ("guardrail", "GUARDRAIL"),
            ("evaluator", "EVALUATOR"),
        ],
    ),
    (
        "openinference.span.kind",
        &[
            ("CHAIN", "CHAIN"),
            ("RETRIEVER", "RETRIEVER"),
            ("LLM", "GENERATION"),
            ("EMBEDDING", "EMBEDDING"),
            ("AGENT", "AGENT"),
            ("TOOL", "TOOL"),
            ("GUARDRAIL", "GUARDRAIL"),
            ("EVALUATOR", "EVALUATOR"),
        ],
    ),
    (
        "gen_ai.operation.name",
        &[
            ("chat", "GENERATION"),
            ("completion", "GENERATION"),
            ("text_completion", "GENERATION"),
            ("generate_content", "GENERATION"),
            ("generate", "GENERATION"),
            ("embeddings", "EMBEDDING"),
            ("invoke_agent", "AGENT"),
            ("create_agent", "AGENT"),
            ("execute_tool", "TOOL"),
        ],
    ),
    (
        "genkit:metadata:subtype",
        &[
            ("background-model", "GENERATION"),
            ("model", "GENERATION"),
            ("embedder", "EMBEDDING"),
            ("tool", "TOOL"),
            ("tool.v2", "TOOL"),
            ("retriever", "RETRIEVER"),
            ("evaluator", "EVALUATOR"),
        ],
    ),
];

pub(super) const LEGACY_GENERATION_KEYS: &[&str] = &[
    "langfuse.observation.model.name",
    "langfuse.observation.cost_details",
    "langfuse.observation.usage_details",
    "langfuse.observation.completion_start_time",
    "langfuse.observation.model.parameters",
    "langfuse.observation.prompt.name",
    "langfuse.observation.prompt.version",
];

pub(super) const VERCEL_MODEL_OPERATIONS: &[(&[&str], &str)] = &[
    (
        &[
            "ai.generateText.doGenerate",
            "ai.streamText.doStream",
            "ai.generateObject.doGenerate",
            "ai.streamObject.doStream",
        ],
        "GENERATION",
    ),
    (&["ai.embedMany.doEmbed", "ai.embed.doEmbed"], "EMBEDDING"),
];

pub(super) const VERCEL_MODEL_KEYS: &[&str] = &[
    "langfuse.observation.model.name",
    "ai.model.id",
    "gen_ai.request.model",
    "gen_ai.response.model",
];

pub(super) const INFERRED_OBSERVATION_TYPES: &[(&[&str], &str)] = &[
    (
        &[
            "gen_ai.tool.name",
            "gen_ai.tool.call.id",
            "flue.tool.name",
            "flue.tool.call_id",
        ],
        "TOOL",
    ),
    (&["flue.task.id", "flue.task.agent"], "AGENT"),
];

pub(super) const GENERATION_MODEL_KEYS: &[&str] = &[
    "langfuse.observation.model.name",
    "gen_ai.request.model",
    "gen_ai.response.model",
    "llm.model_name",
    "model",
];
