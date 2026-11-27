//! Where a provider response carries model text, declared per API format as a
//! tree of [`Node`]s, and the walker that reads a JSON body or SSE frame along it.
//!
//! The walker reads borrowed JSON slices and visits only the fields a tree
//! names, so no response becomes a `serde_json::Value`. [`validate`] runs first
//! and rejects what the provider and client could read differently, such as
//! duplicated keys, anywhere in the value.

use std::{borrow::Cow, fmt, ops::Range};

use serde::de::{DeserializeSeed, Error as _, MapAccess, SeqAccess, Visitor};
use serde_json::value::RawValue;

use super::{ParseBudget, ResponseParseError, StreamCollector, StreamKey};
use crate::guardrails::text::{self, Unreadable};

/// Text parts and tool inputs nest at most this deep below a text field.
const MAX_TEXT_DEPTH: usize = 32;
/// Fields of a content part that hold text, in the order they are read.
const PART_FIELDS: [&str; 4] = ["text", "refusal", "transcript", "content"];
/// Stream indices one [`Object`] may declare: a [`StreamKey`] holds two.
const MAX_INDEX: usize = 2;

/// One value in a response, and how to read the text below it.
#[derive(Clone, Copy)]
pub(crate) enum Node {
    Object(Object),
    /// Each array item. A `keyed` item's position is a stream index for the text
    /// below it; a `strict` array fails the read when the value is another type.
    Items {
        item: &'static Node,
        keyed: bool,
        strict: bool,
    },
    Text(Shape, Emit),
}

/// An object and the fields that lead to text, read in this order. A null field
/// is absent; a `strict` object fails the read when the value, such as an array
/// item, is anything else.
#[derive(Clone, Copy)]
pub(crate) struct Object {
    strict: bool,
    index: &'static [&'static str],
    fields: &'static [(&'static str, Node)],
    by: Option<Switch>,
}

/// More fields of the same object, chosen by the string in its `tag` field.
#[derive(Clone, Copy)]
struct Switch {
    tag: &'static str,
    cases: &'static [(&'static str, Object)],
    default: Option<&'static Object>,
}

/// The JSON a text field may hold.
#[derive(Clone, Copy)]
pub(crate) enum Shape {
    /// A string; other values hold no text.
    Str,
    /// A string, or an array of strings and parts with `text`, `refusal` or
    /// nested `content`. A `strict` field fails the read on any other value.
    Parts { strict: bool },
    /// Every string anywhere below, such as a tool's input object.
    Strings,
}

/// What a text is to the guardrails.
#[derive(Clone, Copy)]
pub(crate) enum Emit {
    /// One piece of a streamed text, joined with earlier pieces of its stream.
    Delta(Stream),
    /// A complete copy of a streamed text, rewritten together with the stream.
    Summary(Stream),
    /// A standalone text. A `signable` one is read-only when its object carries
    /// a non-empty `Signature`, since rewriting it would invalidate the signature.
    Leaf { json: bool, signable: bool },
    /// A copy of an earlier text, attached to the block with the same text.
    Copy,
    /// A provider signature: when non-empty, makes this object's `signable`
    /// leaves and its index's streamed thinking read-only.
    Signature,
}

/// A streamed text, named by `slot` and the stream indices above it. A `json`
/// stream holds tool arguments that must stay valid JSON after redaction.
#[derive(Clone, Copy)]
pub(crate) struct Stream {
    slot: &'static str,
    json: bool,
}

impl Object {
    pub(crate) const fn new(fields: &'static [(&'static str, Node)]) -> Self {
        Self {
            strict: false,
            index: &[],
            fields,
            by: None,
        }
    }

    /// Fails the read when the value is not an object.
    pub(crate) const fn strict(self) -> Self {
        Self {
            strict: true,
            ..self
        }
    }

    /// Reads these integer fields as stream indices for the text below, `0` when absent.
    pub(crate) const fn indexed(self, index: &'static [&'static str]) -> Self {
        assert!(index.len() <= MAX_INDEX, "a stream has at most two indices");
        Self { index, ..self }
    }

    pub(crate) const fn by(
        self,
        tag: &'static str,
        cases: &'static [(&'static str, Object)],
        default: Option<&'static Object>,
    ) -> Self {
        Self {
            by: Some(Switch {
                tag,
                cases,
                default,
            }),
            ..self
        }
    }

    pub(crate) const fn node(self) -> Node {
        Node::Object(self)
    }
}

/// The text of one API format's responses, as a JSON body and as one SSE frame.
pub(crate) struct ResponseSpec {
    pub json: Node,
    pub sse: Node,
}

pub(crate) const fn each(item: &'static Node) -> Node {
    Node::Items {
        item,
        keyed: false,
        strict: true,
    }
}

/// Each array item, its position a stream index.
pub(crate) const fn keyed_each(item: &'static Node) -> Node {
    Node::Items {
        item,
        keyed: true,
        strict: true,
    }
}

/// Each array item, its position a stream index; another value is skipped.
pub(crate) const fn maybe_keyed_each(item: &'static Node) -> Node {
    Node::Items {
        item,
        keyed: true,
        strict: false,
    }
}

pub(crate) const fn text(emit: Emit) -> Node {
    Node::Text(Shape::Str, emit)
}

pub(crate) const fn parts(emit: Emit) -> Node {
    Node::Text(Shape::Parts { strict: false }, emit)
}

pub(crate) const fn strict_parts(emit: Emit) -> Node {
    Node::Text(Shape::Parts { strict: true }, emit)
}

pub(crate) const fn strings(emit: Emit) -> Node {
    Node::Text(Shape::Strings, emit)
}

pub(crate) const LEAF: Emit = Emit::Leaf {
    json: false,
    signable: false,
};
pub(crate) const JSON_LEAF: Emit = Emit::Leaf {
    json: true,
    signable: false,
};
pub(crate) const SIGNED_LEAF: Emit = Emit::Leaf {
    json: false,
    signable: true,
};

pub(crate) const fn delta(slot: &'static str) -> Emit {
    Emit::Delta(Stream { slot, json: false })
}

pub(crate) const fn json_delta(slot: &'static str) -> Emit {
    Emit::Delta(Stream { slot, json: true })
}

pub(crate) const fn summary(slot: &'static str) -> Emit {
    Emit::Summary(Stream { slot, json: false })
}

pub(crate) const fn json_summary(slot: &'static str) -> Emit {
    Emit::Summary(Stream { slot, json: true })
}

/// Reads the text along `node` from the JSON `payload` into `collector`.
/// `payload` is the body spans `data` joined by line breaks, as SSE `data`
/// lines are; each text is recorded with the body span of its JSON string.
pub(super) fn read(
    node: &Node,
    payload: &str,
    data: &[Range<usize>],
    collector: &mut StreamCollector,
    budget: &mut ParseBudget,
) -> Result<(), Unreadable> {
    let json = payload.trim_ascii();
    Walker {
        payload,
        data,
        collector,
        budget,
        index: Vec::new(),
        entries: Vec::new(),
        signed: false,
    }
    .read_node(node, json)
}

struct Walker<'c, 'a> {
    payload: &'a str,
    data: &'c [Range<usize>],
    collector: &'c mut StreamCollector,
    budget: &'c mut ParseBudget,
    index: Vec<u64>,
    /// Members of the objects being read, innermost last.
    entries: Vec<(Cow<'a, str>, &'a str)>,
    /// Whether the object being read carries a non-empty signature.
    signed: bool,
}

impl<'a> Walker<'_, 'a> {
    fn read_node(&mut self, node: &Node, raw: &'a str) -> Result<(), Unreadable> {
        match *node {
            Node::Object(object) if raw.starts_with('{') => {
                self.read_object(raw, |walker, start| walker.read_members(&object, start))
            }
            Node::Object(object) => mismatch(object.strict),
            Node::Items {
                item,
                keyed,
                strict,
            } => {
                if !raw.starts_with('[') {
                    return mismatch(strict);
                }
                self.read_items(raw, |walker, position, value| {
                    if keyed {
                        walker.index.push(position as u64);
                    }
                    let read = walker.read_node(item, value);
                    if keyed {
                        walker.index.pop();
                    }
                    read
                })
            }
            Node::Text(shape, emit) => self.read_text(shape, emit, raw),
        }
    }

    /// Puts the members of the object `raw` on `entries` while `read` reads
    /// them, from the start it is given.
    fn read_object(
        &mut self,
        raw: &'a str,
        read: impl FnOnce(&mut Self, usize) -> Result<(), Unreadable>,
    ) -> Result<(), Unreadable> {
        let start = self.entries.len();
        let entries = &mut self.entries;
        for_each_entry(raw, self.budget, |key, value| entries.push((key, value)))?;
        self.charge((self.entries.len() - start) * size_of::<(Cow<'_, str>, &str)>())?;
        let result = read(self, start);
        self.entries.truncate(start);
        result
    }

    fn member(&self, start: usize, name: &str) -> Option<&'a str> {
        self.entries
            .get(start..)?
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| *value)
    }

    fn read_members(&mut self, object: &Object, start: usize) -> Result<(), Unreadable> {
        let depth = self.index.len();
        for name in object.index {
            let index = self.member(start, name);
            self.index.push(
                index
                    .and_then(|index| serde_json::from_str(index).ok())
                    .unwrap_or(0),
            );
        }
        let signed = std::mem::replace(&mut self.signed, false);
        let mut read = Ok(());
        for (name, child) in object.fields {
            if let Some(value) = self.member(start, name).filter(|value| *value != "null") {
                read = self.read_node(child, value);
                if read.is_err() {
                    break;
                }
            }
        }
        if read.is_ok()
            && let Some(by) = object.by
        {
            let tag = self.member(start, by.tag).and_then(decode);
            let case = by
                .cases
                .iter()
                .find(|(name, _)| tag.as_deref() == Some(*name))
                .map(|(_, case)| case)
                .or(by.default);
            if let Some(case) = case {
                read = self.read_members(case, start);
            }
        }
        self.signed = signed;
        self.index.truncate(depth);
        read
    }

    fn read_text(&mut self, shape: Shape, emit: Emit, raw: &'a str) -> Result<(), Unreadable> {
        match shape {
            Shape::Str => self.read_string(emit, raw),
            Shape::Parts { strict } if !raw.starts_with(['"', '[']) => mismatch(strict),
            Shape::Parts { .. } => self.read_parts(emit, raw, 0),
            Shape::Strings => self.read_strings(emit, raw, 0),
        }
    }

    fn read_string(&mut self, emit: Emit, raw: &str) -> Result<(), Unreadable> {
        if !raw.starts_with('"') {
            return Ok(());
        }
        let text = decode(raw).ok_or(Unreadable)?;
        if let Cow::Owned(owned) = &text {
            self.charge(owned.capacity())?;
        }
        let span = self.span(raw).ok_or(Unreadable)?;
        self.emit(emit, span, &text);
        Ok(())
    }

    /// The body span of `raw`, a JSON string inside the payload.
    fn span(&self, raw: &str) -> Option<Range<usize>> {
        let mut offset = raw
            .as_ptr()
            .addr()
            .checked_sub(self.payload.as_ptr().addr())?;
        for line in self.data {
            if offset + raw.len() <= line.len() {
                let start = line.start + offset;
                return Some(start..start + raw.len());
            }
            offset = offset.checked_sub(line.len() + 1)?;
        }
        None
    }

    /// A string, or an array of strings and content parts.
    fn read_parts(&mut self, emit: Emit, raw: &'a str, depth: usize) -> Result<(), Unreadable> {
        if depth > MAX_TEXT_DEPTH {
            return Err(Unreadable);
        }
        if !raw.starts_with('[') {
            return self.read_string(emit, raw);
        }
        self.read_items(raw, |walker, _, item| {
            if !item.starts_with('{') {
                return walker.read_string(emit, item);
            }
            walker.read_object(item, |walker, start| {
                for name in PART_FIELDS {
                    if let Some(field) = walker.member(start, name) {
                        walker.read_parts(emit, field, depth + 1)?;
                    }
                }
                Ok(())
            })
        })
    }

    /// Every string below `raw`, object members in key order.
    fn read_strings(&mut self, emit: Emit, raw: &'a str, depth: usize) -> Result<(), Unreadable> {
        if depth > MAX_TEXT_DEPTH {
            return Err(Unreadable);
        }
        match raw.as_bytes().first() {
            Some(b'"') => self.read_string(emit, raw),
            Some(b'[') => self.read_items(raw, |walker, _, item| {
                walker.read_strings(emit, item, depth + 1)
            }),
            Some(b'{') => self.read_object(raw, |walker, start| {
                if let Some(members) = walker.entries.get_mut(start..) {
                    members.sort_unstable_by(|(a, _), (b, _)| a.cmp(b));
                }
                for at in start..walker.entries.len() {
                    let Some(&(_, value)) = walker.entries.get(at) else {
                        break;
                    };
                    walker.read_strings(emit, value, depth + 1)?;
                }
                Ok(())
            }),
            _ => Ok(()),
        }
    }

    fn read_items(
        &mut self,
        raw: &'a str,
        mut visit: impl FnMut(&mut Self, usize, &'a str) -> Result<(), Unreadable>,
    ) -> Result<(), Unreadable> {
        let mut position = 0;
        text::for_each(raw, |item: &RawValue| {
            let read = visit(self, position, item.get());
            position += 1;
            read
        })
    }

    fn emit(&mut self, emit: Emit, span: Range<usize>, text: &str) {
        let key = |slot| StreamKey {
            slot,
            index: [
                self.index.first().copied().unwrap_or(0),
                self.index.get(1).copied().unwrap_or(0),
            ],
        };
        match emit {
            Emit::Delta(stream) => {
                self.collector
                    .push_delta(key(stream.slot), stream.json, span, text);
            }
            Emit::Summary(stream) => {
                self.collector
                    .push_summary(key(stream.slot), stream.json, span, text);
            }
            Emit::Leaf { json, signable } => {
                let editable = !(signable && self.signed);
                self.collector.push_leaf(span, text, json, editable);
            }
            Emit::Copy => self.collector.attach_or_push_leaf(span, text),
            Emit::Signature => {
                if !text.is_empty() {
                    self.signed = true;
                    self.collector
                        .mark_signed_thinking(self.index.first().copied().unwrap_or(0));
                }
            }
        }
    }

    fn charge(&mut self, bytes: usize) -> Result<(), Unreadable> {
        self.budget.charge(bytes).then_some(()).ok_or(Unreadable)
    }
}

/// A value of the wrong type is skipped, or fails a `strict` read.
fn mismatch(strict: bool) -> Result<(), Unreadable> {
    if strict { Err(Unreadable) } else { Ok(()) }
}

/// Checks that `bytes` is one JSON value with no duplicated key in any object,
/// only finite numbers, and only strings a Rust string can hold.
pub(super) fn validate(bytes: &[u8], budget: &mut ParseBudget) -> Result<(), ResponseParseError> {
    struct Unique<'b, 'de> {
        budget: &'b mut ParseBudget,
        /// Keys of the objects being read, innermost last.
        keys: &'b mut Vec<Cow<'de, str>>,
    }

    impl<'de> Unique<'_, 'de> {
        fn child(&mut self) -> Unique<'_, 'de> {
            Unique {
                budget: self.budget,
                keys: self.keys,
            }
        }
    }

    impl<'de> DeserializeSeed<'de> for Unique<'_, 'de> {
        type Value = ();

        fn deserialize<D: serde::Deserializer<'de>>(self, deserializer: D) -> Result<(), D::Error> {
            deserializer.deserialize_any(self)
        }
    }

    impl<'de> Visitor<'de> for Unique<'_, 'de> {
        type Value = ();

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("any valid JSON value without duplicate object keys")
        }

        fn visit_bool<E>(self, _: bool) -> Result<(), E> {
            Ok(())
        }
        fn visit_i64<E>(self, _: i64) -> Result<(), E> {
            Ok(())
        }
        fn visit_u64<E>(self, _: u64) -> Result<(), E> {
            Ok(())
        }
        fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<(), E> {
            if v.is_finite() {
                Ok(())
            } else {
                Err(E::custom("non-finite float"))
            }
        }
        fn visit_str<E>(self, _: &str) -> Result<(), E> {
            Ok(())
        }
        fn visit_unit<E>(self) -> Result<(), E> {
            Ok(())
        }
        fn visit_seq<A: SeqAccess<'de>>(mut self, mut seq: A) -> Result<(), A::Error> {
            while seq.next_element_seed(self.child())?.is_some() {}
            Ok(())
        }
        fn visit_map<A: MapAccess<'de>>(mut self, mut map: A) -> Result<(), A::Error> {
            let start = self.keys.len();
            while let Some(key) = map.next_key_seed(Key)? {
                let owned = if let Cow::Owned(owned) = &key {
                    owned.capacity()
                } else {
                    0
                };
                if !self.budget.charge(size_of::<Cow<'_, str>>() + owned) {
                    return Err(A::Error::custom("memory budget exhausted"));
                }
                self.keys.push(key);
                map.next_value_seed(self.child())?;
            }
            let keys = self.keys.get_mut(start..).unwrap_or_default();
            keys.sort_unstable();
            let duplicated = keys.windows(2).any(|pair| pair.first() == pair.last());
            self.keys.truncate(start);
            if duplicated {
                return Err(A::Error::custom("duplicate object key"));
            }
            Ok(())
        }
    }

    let mut keys = Vec::new();
    let mut deserializer = serde_json::Deserializer::from_slice(bytes);
    let checked = Unique {
        budget: &mut *budget,
        keys: &mut keys,
    }
    .deserialize(&mut deserializer)
    .and_then(|()| deserializer.end());
    match checked {
        Ok(()) if budget.flush() => Ok(()),
        Ok(()) => Err(ResponseParseError::Busy),
        Err(_) => Err(budget.failure()),
    }
}

/// A JSON string, borrowed when it has no escapes.
fn decode(json: &str) -> Option<Cow<'_, str>> {
    serde_json::from_str::<&str>(json)
        .map(Cow::Borrowed)
        .or_else(|_| serde_json::from_str::<String>(json).map(Cow::Owned))
        .ok()
}

/// Calls `visit` with each member of the JSON object `raw`, keys decoded.
fn for_each_entry<'a>(
    raw: &'a str,
    budget: &mut ParseBudget,
    mut visit: impl FnMut(Cow<'a, str>, &'a str),
) -> Result<(), Unreadable> {
    struct Entries<'b, F>(&'b mut ParseBudget, F);

    impl<'de, F: FnMut(Cow<'de, str>, &'de RawValue)> Visitor<'de> for Entries<'_, F> {
        type Value = ();

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("a JSON object")
        }

        fn visit_map<A: MapAccess<'de>>(mut self, mut entries: A) -> Result<(), A::Error> {
            while let Some(key) = entries.next_key_seed(Key)? {
                let owned = if let Cow::Owned(owned) = &key {
                    owned.capacity()
                } else {
                    0
                };
                if !self.0.charge(owned) {
                    return Err(A::Error::custom("memory budget exhausted"));
                }
                (self.1)(key, entries.next_value()?);
            }
            Ok(())
        }
    }

    let mut deserializer = serde_json::Deserializer::from_str(raw);
    let visit = |key, value: &'a RawValue| visit(key, value.get());
    serde::Deserializer::deserialize_map(&mut deserializer, Entries(budget, visit))
        .and_then(|()| deserializer.end())
        .map_err(|_| Unreadable)
}

/// An object key, borrowed from the JSON when it has no escapes.
struct Key;

impl<'de> DeserializeSeed<'de> for Key {
    type Value = Cow<'de, str>;

    fn deserialize<D: serde::Deserializer<'de>>(
        self,
        deserializer: D,
    ) -> Result<Self::Value, D::Error> {
        deserializer.deserialize_str(self)
    }
}

impl<'de> Visitor<'de> for Key {
    type Value = Cow<'de, str>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("an object key")
    }

    fn visit_borrowed_str<E>(self, v: &'de str) -> Result<Self::Value, E> {
        Ok(Cow::Borrowed(v))
    }
    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E> {
        Ok(Cow::Owned(v.to_owned()))
    }
    fn visit_string<E>(self, v: String) -> Result<Self::Value, E> {
        Ok(Cow::Owned(v))
    }
}

#[cfg(test)]
mod tests {
    use axum::body::Bytes;

    use super::*;
    use crate::guardrails::response::{Body, RedactionApply, parse_sse};

    const BEFORE: Node = Object::new(&[(
        "delta",
        Object::new(&[("text", text(delta("text")))]).node(),
    )])
    .node();
    /// `BEFORE` with one more declared key: the whole change a new provider field needs.
    const AFTER: Node = Object::new(&[(
        "delta",
        Object::new(&[
            ("text", text(delta("text"))),
            ("transcript", text(delta("transcript"))),
        ])
        .node(),
    )])
    .node();

    #[test]
    fn a_declared_key_is_scanned_and_redacted_in_every_frame() {
        let sse = concat!(
            "data: {\"delta\":{\"text\":\"hi\",\"transcript\":\"SSN 123-\"}}\n\n",
            "data: {\"delta\":{\"transcript\":\"45-6789\"}}\n\n",
        );
        let parse = |node| {
            parse_sse(
                node,
                Body::new(vec![Bytes::from_static(sse.as_bytes())]),
                None,
            )
            .unwrap()
        };
        let texts = |node| {
            parse(node)
                .blocks
                .iter()
                .map(|block| block.text.clone())
                .collect::<Vec<_>>()
        };

        assert_eq!(texts(&BEFORE), ["hi"]);
        assert_eq!(texts(&AFTER), ["hi", "SSN 123-45-6789"]);
        let RedactionApply::Rewritten(rewritten) = parse(&AFTER)
            .apply_redactions(&[(1, "SSN [SSN]".to_owned())], None)
            .unwrap()
        else {
            panic!("the new key's stream is rewritten");
        };
        assert_eq!(
            rewritten,
            concat!(
                "data: {\"delta\":{\"text\":\"hi\",\"transcript\":\"SSN [SSN]\"}}\n\n",
                "data: {\"delta\":{\"transcript\":\"\"}}\n\n",
            )
        );
    }
}
