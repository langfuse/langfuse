//! Old-vs-new equivalence: generated requests must give the same text leaves, raw
//! spans, turn scopes and unreadable outcomes from the spec walker as from the
//! previous readers.

use std::collections::BTreeMap;
use std::fmt::Write as _;

use serde_json::{Value, json, value::RawValue};

use crate::guardrails::spec::Members;
use crate::resolution::ApiFormat;

const CASES_PER_FORMAT: usize = 4000;

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
    fn chance(&mut self, per_mille: u64) -> bool {
        self.next() % 1000 < per_mille
    }
    fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.below(items.len())]
    }
}

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
    "messages",
    "role",
    "content",
    "text",
    "type",
    "source",
    "data",
    "tool_calls",
    "input",
    "output",
    "instructions",
    "prompt",
    "variables",
    "system",
    "previous_response_id",
    "conversation",
    "image_url",
    "url",
    "tool_use_id",
    "arguments",
    "x",
];
const STRINGS: &[&str] = &[
    "user",
    "assistant",
    "system",
    "tool",
    "developer",
    "text",
    "content",
    "document",
    "message",
    "function_call",
    "function_call_output",
    "reasoning",
    "mcp_call",
    "SSN 123-45-6789",
    "",
    "é🔑",
    "x/y~z",
];
const RAWS: &[&str] = &["0", "1", "-1", "1.5", "true", "false", "null"];

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
        *value = random(rng, 3);
        return;
    }
    match value {
        G::Obj(entries) => {
            if !entries.is_empty() && rng.chance(60) {
                let at = rng.below(entries.len());
                entries.remove(at);
            }
            if rng.chance(60) {
                entries.push(((*rng.pick(KEYS)).to_owned(), random(rng, 3)));
            }
            for (_, child) in entries {
                mutate(child, rng);
            }
        }
        G::Arr(items) => {
            if !items.is_empty() && rng.chance(80) {
                let copy = items[rng.below(items.len())].clone();
                let at = rng.below(items.len() + 1);
                items.insert(at, copy);
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

fn write(value: &G, root: bool, rng: &mut Rng, out: &mut String) {
    match value {
        G::Obj(entries) => {
            let mut order: Vec<&(String, G)> = entries.iter().collect();
            for i in (1..order.len()).rev() {
                order.swap(i, rng.below(i + 1));
            }
            if !root && !order.is_empty() && rng.chance(10) {
                order.push(order[0]);
            }
            out.push('{');
            for (i, (key, child)) in order.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_str(key, rng, out);
                out.push(':');
                write(child, false, rng, out);
            }
            out.push('}');
        }
        G::Arr(items) => {
            out.push('[');
            for (i, child) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(if rng.chance(100) { " , " } else { "," });
                }
                write(child, false, rng, out);
            }
            out.push(']');
        }
        G::Str(text) => write_str(text, rng, out),
        G::Raw(token) => out.push_str(token),
    }
}

fn templates(api_format: ApiFormat) -> Vec<Value> {
    match api_format {
        ApiFormat::OpenAiChatCompletions => vec![
            json!({"model":"m","messages":[{"role":"system","content":"s"},{"role":"user","content":"hi SSN 123-45-6789"},{"role":"assistant","content":[{"type":"text","text":"a"}],"tool_calls":[{"function":{"arguments":"{}"}}]},{"role":"tool","content":"res"},{"role":"user","content":[{"type":"text","text":"x"},{"type":"image_url","image_url":{"url":"u"}}]}]}),
            json!({"model":"m","messages":[{"role":"user","content":[{"type":"text","text":"q","content":[{"text":"n","content":[{"text":"deep","content":[{"text":"deeper"}]}]}]}]}]}),
        ],
        ApiFormat::AnthropicMessages => vec![
            json!({"model":"m","system":[{"type":"text","text":"sys"}],"messages":[{"role":"user","content":[{"type":"text","text":"q"},{"type":"document","source":{"type":"text","data":"doc"}},{"type":"document","source":{"type":"content","content":[{"type":"text","text":"c"}]}}]},{"role":"assistant","content":"a"},{"role":"user","content":[{"type":"tool_result","tool_use_id":"t","content":[{"type":"text","text":"r","content":[{"text":"deep"}]}]}]}]}),
            json!({"model":"m","system":"plain","messages":[{"role":"user","content":"only"}]}),
        ],
        ApiFormat::OpenAiResponses => vec![
            json!({"model":"m","instructions":"i","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"x"}]},{"type":"function_call","arguments":"{}"},{"type":"function_call_output","output":"o"},{"role":"assistant","content":"a"},{"role":"user","content":"u"}],"previous_response_id":null,"prompt":{"id":"p","variables":{"a":"v","b":{"type":"input_text","text":"pt"},"c":[{"text":"arr"}]}}}),
            json!({"model":"m","input":"just text","conversation":"conv_1","instructions":[{"type":"input_text","text":"ins"}]}),
        ],
        ApiFormat::OpenAiEmbeddings => vec![
            json!({"model":"m","input":["a","SSN 123-45-6789"]}),
            json!({"model":"m","input":"x"}),
        ],
        ApiFormat::OpenAiDecisions => vec![
            json!({"model":"m","input":"q"}),
            json!({"model":"m","input":[{"role":"user","content":"c"}]}),
        ],
    }
}

/// Everything a read produces: `(offset of the raw string, text, in last turn)`
/// for each scope, or `None` where it is unreadable.
type Reads = Vec<Option<Vec<(usize, String, bool)>>>;

fn reads<T>(
    body: &str,
    members: &Members<'_, '_>,
    turn: Result<T, crate::guardrails::text::Unreadable>,
    read: impl Fn(
        &T,
        &Members<'_, '_>,
        bool,
        &mut dyn FnMut(crate::guardrails::text::TextLeaf<'_>, bool) -> bool,
    ) -> Result<(), crate::guardrails::text::Unreadable>,
) -> Option<Reads> {
    let turn = turn.ok()?;
    Some(
        [false, true]
            .into_iter()
            .map(|entire| {
                let mut leaves = Vec::new();
                read(&turn, members, entire, &mut |leaf, last| {
                    let offset = leaf.raw.as_ptr().addr() - body.as_ptr().addr();
                    leaves.push((offset, leaf.text.to_owned(), last));
                    true
                })
                .ok()?;
                Some(leaves)
            })
            .collect(),
    )
}

fn legacy_turn(
    api_format: ApiFormat,
    members: &Members<'_, '_>,
) -> Result<super::text::LastTurn, crate::guardrails::text::Unreadable> {
    match api_format {
        ApiFormat::OpenAiChatCompletions => super::chat_turn(members),
        ApiFormat::AnthropicMessages => super::anthropic_turn(members),
        ApiFormat::OpenAiResponses => super::responses_turn(members),
        ApiFormat::OpenAiEmbeddings => super::embeddings_turn(members),
        ApiFormat::OpenAiDecisions => super::decisions_turn(members),
    }
}

/// Returns whether the request was readable with at least one leaf.
fn assert_equivalent(api_format: ApiFormat, body: &str) -> bool {
    let Ok(top) = serde_json::from_str::<BTreeMap<&str, &RawValue>>(body) else {
        return false;
    };
    let find = |name: &str| top.get(name).map(|value| value.get());
    let spec = crate::capture::request_spec(api_format);
    let members = Members::new(spec.members, &find);
    let old = reads(
        body,
        &members,
        legacy_turn(api_format, &members),
        |turn, members, entire, sink| turn.read_scoped_leaves(members, entire, sink),
    );
    let new = reads(
        body,
        &members,
        (spec.last_turn)(&members),
        |turn, members, entire, sink| turn.read_scoped_leaves(members, entire, sink),
    );
    assert_eq!(old, new, "{api_format:?} {body}");
    old.is_some_and(|scopes| scopes.iter().flatten().any(|leaves| !leaves.is_empty()))
}

#[test]
fn spec_walker_reads_requests_like_the_previous_readers() {
    let mut rng = Rng(0x5EED);
    for api_format in [
        ApiFormat::OpenAiChatCompletions,
        ApiFormat::AnthropicMessages,
        ApiFormat::OpenAiResponses,
        ApiFormat::OpenAiEmbeddings,
        ApiFormat::OpenAiDecisions,
    ] {
        let templates = templates(api_format);
        let mut with_text = 0;
        for _ in 0..CASES_PER_FORMAT {
            let mut request = from_value(rng.pick(&templates));
            if rng.chance(850) {
                mutate(&mut request, &mut rng);
            }
            let mut body = String::new();
            write(&request, true, &mut rng, &mut body);
            if assert_equivalent(api_format, &body) {
                with_text += 1;
            }
        }
        assert!(
            with_text * 4 > CASES_PER_FORMAT,
            "{api_format:?}: only {with_text} cases had text"
        );
    }
}
