//! Old-vs-new equivalence: generated responses must give the same blocks and the
//! same rewritten bytes from the spec walker as from the old `Value` extractors.

use std::fmt::Write as _;

use axum::body::Bytes;
use serde_json::{Value, json};

use super::super::{ParsedResponse, RedactionApply, ResponseFormat};
use crate::resolution::ApiFormat;

const CASES_PER_FORMAT: usize = 3000;

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % n as u64).unwrap()
    }
    /// True with probability `per_mille / 1000`.
    fn chance(&mut self, per_mille: u64) -> bool {
        self.next() % 1000 < per_mille
    }
    fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.below(items.len())]
    }
}

/// A generated JSON value; `Raw` is a literal token such as a number.
#[derive(Clone)]
enum G {
    Obj(Vec<(String, G)>),
    Arr(Vec<G>),
    Str(String),
    Raw(String),
}

fn from_value(value: &Value) -> G {
    match value {
        Value::Object(map) => G::Obj(
            map.iter()
                .map(|(k, v)| (k.clone(), from_value(v)))
                .collect(),
        ),
        Value::Array(items) => G::Arr(items.iter().map(from_value).collect()),
        Value::String(text) => G::Str(text.clone()),
        other => G::Raw(other.to_string()),
    }
}

const KEYS: &[&str] = &[
    "choices",
    "index",
    "delta",
    "message",
    "content",
    "refusal",
    "reasoning",
    "reasoning_content",
    "tool_calls",
    "function",
    "arguments",
    "custom",
    "input",
    "function_call",
    "type",
    "text",
    "thinking",
    "signature",
    "content_block",
    "partial_json",
    "output",
    "output_text",
    "summary",
    "output_index",
    "content_index",
    "summary_index",
    "part",
    "item",
    "response",
    "id",
    "name",
    "role",
    "x",
];
const STRINGS: &[&str] = &[
    "",
    "a",
    "SSN 123-45-6789",
    "é🔑",
    "x/y~z",
    "{\"k\":1}",
    "[DONE]",
    "sig",
    "reasoning",
    "mcp_call",
    "text_delta",
    "thinking_delta",
    "signature_delta",
    "input_json_delta",
    "content_block_start",
    "content_block_delta",
    "response.output_text.delta",
    "response.completed",
    "response.output_item.done",
    "response.content_part.done",
];
const RAWS: &[&str] = &[
    "0",
    "1",
    "2",
    "-1",
    "1.0",
    "1e2",
    "18446744073709551616",
    "true",
    "false",
    "null",
];

fn random(rng: &mut Rng, depth: usize) -> G {
    match rng.below(if depth == 0 { 2 } else { 5 }) {
        0 => G::Str((*rng.pick(STRINGS)).to_owned()),
        1 => G::Raw((*rng.pick(RAWS)).to_owned()),
        2 | 3 => G::Obj(
            (0..rng.below(4))
                .map(|_| ((*rng.pick(KEYS)).to_owned(), random(rng, depth - 1)))
                .collect(),
        ),
        _ => G::Arr((0..rng.below(4)).map(|_| random(rng, depth - 1)).collect()),
    }
}

fn mutate(value: &mut G, rng: &mut Rng) {
    if rng.chance(40) {
        *value = random(rng, 2);
        return;
    }
    match value {
        G::Obj(entries) => {
            if !entries.is_empty() && rng.chance(60) {
                let at = rng.below(entries.len());
                entries.remove(at);
            }
            if rng.chance(60) {
                entries.push(((*rng.pick(KEYS)).to_owned(), random(rng, 2)));
            }
            for (_, child) in entries {
                mutate(child, rng);
            }
        }
        G::Arr(items) => {
            if !items.is_empty() && rng.chance(60) {
                let copy = items[rng.below(items.len())].clone();
                items.push(copy);
            }
            for child in items {
                mutate(child, rng);
            }
        }
        G::Str(text) => {
            if rng.chance(60) {
                *text = (*rng.pick(STRINGS)).to_owned();
            }
        }
        G::Raw(_) => {}
    }
}

fn write_str(text: &str, rng: &mut Rng, out: &mut String) {
    out.push('"');
    for ch in serde_json::to_string(text)
        .unwrap()
        .trim_matches('"')
        .chars()
    {
        if ch.is_ascii_alphanumeric() && rng.chance(30) {
            write!(out, "\\u{:04x}", u32::from(ch)).unwrap();
        } else {
            out.push(ch);
        }
    }
    if rng.chance(2) {
        out.push_str("\\ud800");
    }
    out.push('"');
}

fn write(value: &G, rng: &mut Rng, out: &mut String) {
    match value {
        G::Obj(entries) => {
            let mut order: Vec<&(String, G)> = entries.iter().collect();
            for i in (1..order.len()).rev() {
                order.swap(i, rng.below(i + 1));
            }
            if !order.is_empty() && rng.chance(5) {
                order.push(order[0]);
            }
            out.push('{');
            for (i, (key, child)) in order.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_str(key, rng, out);
                out.push(':');
                write(child, rng, out);
            }
            out.push('}');
        }
        G::Arr(items) => {
            out.push('[');
            for (i, child) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(if rng.chance(100) { ", " } else { "," });
                }
                write(child, rng, out);
            }
            out.push(']');
        }
        G::Str(text) => write_str(text, rng, out),
        G::Raw(token) => out.push_str(token),
    }
}

fn templates(api_format: ApiFormat, format: ResponseFormat) -> Vec<Value> {
    match (api_format, format) {
        (ApiFormat::OpenAiChatCompletions, ResponseFormat::Sse) => vec![
            json!({"id":"c","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"SSN 123-"},"finish_reason":null}]}),
            json!({"choices":[{"index":0,"delta":{"content":"45-6789"}}]}),
            json!({"choices":[{"index":0,"delta":{"content":[{"type":"text","text":"a"},"b",{"refusal":"r"},{"content":[{"text":"n"}]}]}}]}),
            json!({"choices":[{"index":1,"delta":{"tool_calls":[{"index":0,"id":"t","function":{"name":"f","arguments":"{\"a\":"}},{"index":1,"custom":{"input":"x"}}]}}]}),
            json!({"choices":[{"index":0,"delta":{"function_call":{"arguments":"{}"},"refusal":"no","reasoning":"think","reasoning_content":"rc"}}]}),
            json!({"choices":[],"usage":{"prompt_tokens":1}}),
        ],
        (ApiFormat::OpenAiChatCompletions, ResponseFormat::Json) => vec![
            json!({"choices":[{"index":0,"message":{"role":"assistant","content":"hi","refusal":null,"tool_calls":[{"function":{"arguments":"{\"a\":1}"}},{"custom":{"input":"q"}}],"function_call":{"arguments":"{}"},"reasoning":"r","reasoning_content":"rc"}}]}),
            json!({"choices":[{"message":{"content":[{"type":"text","text":"a"},"b",{"content":[{"text":"c"}]}]}},{"message":null}]}),
        ],
        (ApiFormat::AnthropicMessages, ResponseFormat::Sse) => vec![
            json!({"type":"message_start","message":{"id":"m","content":[]}}),
            json!({"type":"content_block_start","index":0,"content_block":{"type":"text","text":"SSN"}}),
            json!({"type":"content_block_start","index":1,"content_block":{"type":"thinking","thinking":"","signature":""}}),
            json!({"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"t","name":"f","input":{"b":["x",{"a":"y"}],"a":"z"}}}),
            json!({"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" 123-45"}}),
            json!({"type":"content_block_delta","index":1,"delta":{"type":"thinking_delta","thinking":"hmm"}}),
            json!({"type":"content_block_delta","index":1,"delta":{"type":"signature_delta","signature":"sig"}}),
            json!({"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\"q\":"}}),
            json!({"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}),
        ],
        (ApiFormat::AnthropicMessages, ResponseFormat::Json) => vec![
            json!({"content":[{"type":"thinking","thinking":"t","signature":"s"},{"type":"thinking","thinking":"u"},{"type":"text","text":"SSN 123-45-6789"},{"type":"tool_use","input":{"z":"1","a":["2",{"k":"3"}]}}]}),
            json!({"content":[{"type":"text","text":"a"}],"stop_reason":"end_turn"}),
        ],
        (ApiFormat::OpenAiResponses, ResponseFormat::Sse) => vec![
            json!({"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SSN 123-"}),
            json!({"type":"response.output_text.done","output_index":0,"content_index":0,"text":"SSN 123-"}),
            json!({"type":"response.refusal.delta","output_index":0,"content_index":1,"delta":"no"}),
            json!({"type":"response.refusal.done","output_index":0,"content_index":1,"refusal":"no"}),
            json!({"type":"response.function_call_arguments.delta","output_index":1,"delta":"{\"a\":"}),
            json!({"type":"response.function_call_arguments.done","output_index":1,"arguments":"{\"a\":"}),
            json!({"type":"response.custom_tool_call_input.delta","output_index":2,"delta":"in"}),
            json!({"type":"response.custom_tool_call_input.done","output_index":2,"input":"in"}),
            json!({"type":"response.mcp_call_arguments.delta","output_index":3,"delta":"{}"}),
            json!({"type":"response.mcp_call_arguments.done","output_index":3,"arguments":"{}"}),
            json!({"type":"response.reasoning_text.delta","output_index":4,"content_index":0,"delta":"r"}),
            json!({"type":"response.reasoning_text.done","output_index":4,"content_index":0,"text":"r"}),
            json!({"type":"response.reasoning_summary_text.delta","output_index":4,"summary_index":0,"delta":"s"}),
            json!({"type":"response.reasoning_summary_text.done","output_index":4,"summary_index":0,"text":"s"}),
            json!({"type":"response.content_part.done","output_index":0,"content_index":0,"part":{"type":"output_text","text":"SSN 123-","refusal":"no"}}),
            json!({"type":"response.reasoning_summary_part.done","output_index":4,"summary_index":0,"part":{"text":"s"}}),
            json!({"type":"response.output_item.done","output_index":0,"item":{"type":"message","content":[{"type":"output_text","text":"SSN 123-"}],"text":"t","refusal":"n"}}),
            json!({"type":"response.output_item.done","output_index":4,"item":{"type":"reasoning","content":[{"text":"r"}],"summary":[{"text":"s"}]}}),
            json!({"type":"response.output_item.done","output_index":3,"item":{"type":"mcp_call","arguments":"{}"}}),
            json!({"type":"response.output_item.done","output_index":2,"item":{"type":"custom_tool_call","input":"in"}}),
            json!({"type":"response.completed","response":{"id":"r","output":[{"type":"message","content":[{"text":"SSN 123-"}]},{"type":"function_call","arguments":"{\"a\":"}],"output_text":"SSN 123-"}}),
            json!({"type":"response.incomplete","response":{"output":[{"type":"reasoning","summary":[{"text":"s"}]}]}}),
        ],
        (ApiFormat::OpenAiResponses, ResponseFormat::Json) => vec![
            json!({"output":[{"type":"message","content":[{"type":"output_text","text":"SSN 123-45-6789"}]},{"type":"function_call","arguments":"{\"a\":1}"},{"type":"custom_tool_call","input":"q"},{"type":"reasoning","summary":[{"text":"s"}],"content":"c"},{"text":"t","refusal":["r"]}],"output_text":"SSN 123-45-6789"}),
        ],
        _ => unreachable!(),
    }
}

const EOLS: &[&str] = &["\n", "\r\n", "\r"];

fn sse_body(api_format: ApiFormat, rng: &mut Rng) -> String {
    let templates = templates(api_format, ResponseFormat::Sse);
    let mut body = String::new();
    for _ in 0..=rng.below(8) {
        let eol = *rng.pick(EOLS);
        if rng.chance(300) {
            body.push_str("event: e");
            body.push_str(eol);
        }
        if rng.chance(100) {
            body.push_str(": ping");
            body.push_str(eol);
        }
        let mut json = String::new();
        if rng.chance(50) {
            json.push_str("[DONE]");
        } else {
            let mut frame = from_value(rng.pick(&templates));
            if rng.chance(700) {
                mutate(&mut frame, rng);
            }
            write(&frame, rng, &mut json);
        }
        if let Some(at) = json.find(", ").filter(|_| rng.chance(500)) {
            body.push_str("data: ");
            body.push_str(&json[..=at]);
            body.push_str(eol);
            body.push_str("data:");
            body.push_str(&json[at + 1..]);
        } else {
            body.push_str(if rng.chance(100) { "data:" } else { "data: " });
            body.push_str(&json);
        }
        body.push_str(eol);
        body.push_str(rng.pick(EOLS));
    }
    if rng.chance(60) {
        body.push_str(": trailing comment\n");
    }
    if rng.chance(50) {
        let mut cut = rng.below(body.len());
        while !body.is_char_boundary(cut) {
            cut -= 1;
        }
        body.truncate(cut);
    }
    body
}

fn json_body(api_format: ApiFormat, rng: &mut Rng) -> String {
    let mut value = from_value(rng.pick(&templates(api_format, ResponseFormat::Json)));
    if rng.chance(800) {
        mutate(&mut value, rng);
    }
    let mut body = String::new();
    write(&value, rng, &mut body);
    body
}

fn split(body: &[u8], rng: &mut Rng) -> Vec<Bytes> {
    let mut cuts: Vec<usize> = (0..rng.below(5))
        .map(|_| rng.below(body.len() + 1))
        .collect();
    cuts.sort_unstable();
    let mut chunks = Vec::new();
    let mut start = 0;
    for cut in cuts.into_iter().chain([body.len()]) {
        chunks.push(Bytes::copy_from_slice(&body[start..cut]));
        start = cut;
    }
    chunks
}

type Normalized = Vec<(
    String,
    bool,
    bool,
    Vec<(usize, String)>,
    Vec<(Option<usize>, String)>,
)>;

fn legacy_blocks(parsed: &super::ParsedResponse) -> Normalized {
    parsed
        .blocks
        .iter()
        .map(|block| {
            (
                block.text.clone(),
                block.editable,
                block.json_encoded,
                block.deltas.clone(),
                block.leaves.clone(),
            )
        })
        .collect()
}

/// Text, editability, JSON encoding and how many strings each block came from.
fn shapes(blocks: &Normalized) -> Vec<(String, bool, bool, usize, usize)> {
    blocks
        .iter()
        .map(|(text, editable, json, deltas, leaves)| {
            (text.clone(), *editable, *json, deltas.len(), leaves.len())
        })
        .collect()
}

fn new_shapes(parsed: &ParsedResponse) -> Vec<(String, bool, bool, usize, usize)> {
    parsed
        .blocks
        .iter()
        .map(|block| {
            (
                block.text.clone(),
                block.editable,
                block.json_encoded,
                block.deltas.len(),
                block.leaves.len(),
            )
        })
        .collect()
}

/// A redaction outcome, a rewritten body as the old parser reads it.
#[derive(Debug, PartialEq)]
enum Applied {
    Rewritten(Normalized),
    Unchanged,
    InvalidJson,
    Failed,
}

fn reread(api_format: ApiFormat, format: ResponseFormat, bytes: Bytes) -> Applied {
    let parsed = super::ParsedResponse::parse(api_format, format, bytes, None)
        .expect("a rewritten body parses");
    Applied::Rewritten(legacy_blocks(&parsed))
}

fn edits(blocks: usize) -> Vec<(usize, String)> {
    (0..blocks)
        .map(|i| {
            (
                i,
                if i % 2 == 0 {
                    format!("[{i}]")
                } else {
                    format!("<{i}>")
                },
            )
        })
        .collect()
}

/// Returns whether the response parsed with at least one block.
fn assert_equivalent(
    api_format: ApiFormat,
    format: ResponseFormat,
    body: &str,
    rng: &mut Rng,
) -> bool {
    let legacy = super::ParsedResponse::parse(
        api_format,
        format,
        Bytes::copy_from_slice(body.as_bytes()),
        None,
    );
    let new = ParsedResponse::parse(api_format, format, split(body.as_bytes(), rng), None);
    let (legacy, new) = match (legacy, new) {
        (Err(_), Err(_)) => return false,
        (Ok(legacy), Ok(new)) => (legacy, new),
        (legacy, new) => panic!(
            "{api_format:?} {format:?} legacy ok={} new ok={} for {body:?}",
            legacy.is_ok(),
            new.is_ok()
        ),
    };
    let blocks = legacy_blocks(&legacy);
    assert_eq!(
        shapes(&blocks),
        new_shapes(&new),
        "{api_format:?} {format:?} {body:?}"
    );
    let edits = edits(blocks.len());
    let legacy_applied = match legacy.apply_redactions(&edits, None).unwrap() {
        super::RedactionApply::Rewritten(bytes) => reread(api_format, format, bytes),
        super::RedactionApply::Unchanged => Applied::Unchanged,
        super::RedactionApply::InvalidJson => Applied::InvalidJson,
        super::RedactionApply::Failed => Applied::Failed,
    };
    let new_applied = match new.apply_redactions(&edits, None).unwrap() {
        RedactionApply::Rewritten(bytes) => reread(api_format, format, bytes),
        RedactionApply::Unchanged => Applied::Unchanged,
        RedactionApply::InvalidJson => Applied::InvalidJson,
        RedactionApply::Failed => Applied::Failed,
    };
    assert_eq!(
        legacy_applied, new_applied,
        "{api_format:?} {format:?} {body:?}"
    );
    !blocks.is_empty()
}

#[test]
fn spec_walker_matches_the_value_extractors_on_generated_responses() {
    let mut rng = Rng(0x5EED);
    for api_format in [
        ApiFormat::OpenAiChatCompletions,
        ApiFormat::AnthropicMessages,
        ApiFormat::OpenAiResponses,
    ] {
        for format in [ResponseFormat::Json, ResponseFormat::Sse] {
            let mut with_blocks = 0;
            for _ in 0..CASES_PER_FORMAT {
                let body = match format {
                    ResponseFormat::Json => json_body(api_format, &mut rng),
                    ResponseFormat::Sse => sse_body(api_format, &mut rng),
                };
                if assert_equivalent(api_format, format, &body, &mut rng) {
                    with_blocks += 1;
                }
            }
            assert!(
                with_blocks * 4 > CASES_PER_FORMAT,
                "{api_format:?} {format:?}: only {with_blocks} cases had text"
            );
        }
    }
}
