//! Reads a JSON value along a [`Node`] tree. It reads borrowed JSON slices and
//! visits only the fields a tree names, so no value becomes a `serde_json::Value`.
//! [`validate`] runs first on responses and rejects what the provider and client
//! could read differently, such as duplicated keys, anywhere in the value.

use std::{borrow::Cow, fmt, ops::Range};

use serde::de::{DeserializeSeed, Error as _, MapAccess, SeqAccess, Visitor};
use serde_json::value::RawValue;

use super::{Emit, Node, Object, Shape};
use crate::guardrails::response::{ParseBudget, ResponseParseError, StreamCollector, StreamKey};
use crate::guardrails::text::{self, TextLeaf, Unreadable};

/// Text parts and tool inputs nest at most this deep below a text field.
const MAX_TEXT_DEPTH: usize = 32;
/// Fields of a content part that hold text, in the order they are read.
const PART_FIELDS: [&str; 3] = ["text", "refusal", "content"];

/// Reads the text along `node` from the JSON `payload` into `collector`.
/// `payload` is the body spans `data` joined by line breaks, as SSE `data`
/// lines are; each text is recorded with the body span of its JSON string.
pub(in crate::guardrails) fn read(
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
        out: Out::Blocks(collector),
        budget,
        index: Vec::new(),
        entries: Vec::new(),
        signed: false,
    }
    .read_node(node, json)
}

/// Reads the text along `node` from the request member `raw` into `sink`. A
/// field the tree reads that appears twice is unreadable, since the provider
/// could read either copy; requests are not validated as a whole first.
pub(in crate::guardrails) fn read_leaves(
    node: &Node,
    raw: &str,
    sink: &mut dyn FnMut(TextLeaf<'_>),
) -> Result<(), Unreadable> {
    let mut budget = ParseBudget::new(None).map_err(|_| Unreadable)?;
    let whole = 0..raw.len();
    Walker {
        payload: raw,
        data: std::slice::from_ref(&whole),
        out: Out::Leaves(sink),
        budget: &mut budget,
        index: Vec::new(),
        entries: Vec::new(),
        signed: false,
    }
    .read_node(node, raw)
}

/// Where the text a walk finds goes.
enum Out<'c> {
    /// Response blocks, streamed text joined by its stream.
    Blocks(&'c mut StreamCollector),
    /// Request text, each leaf with its raw JSON string.
    Leaves(&'c mut dyn FnMut(TextLeaf<'_>)),
}

struct Walker<'c, 'a> {
    payload: &'a str,
    data: &'c [Range<usize>],
    out: Out<'c>,
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
            Node::Object(object) if raw.starts_with('{') => self.read_object(
                raw,
                |key| wants(&object, key),
                |walker, start| walker.read_members(&object, start),
            ),
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
            Node::OneOf(nodes) => {
                for node in nodes {
                    self.read_node(node, raw)?;
                }
                Ok(())
            }
            Node::Values(item) if raw.starts_with('{') => {
                text::for_each_value(raw, |value| self.read_node(item, value.get()))
            }
            Node::Values(_) => Ok(()),
            Node::Text(shape, emit) => self.read_text(shape, emit, raw),
        }
    }

    /// Puts the members of the object `raw` on `entries` while `read` reads
    /// them, from the start it is given. A request keeps only the `wanted`
    /// members and fails on a duplicated one; a response was validated whole.
    fn read_object(
        &mut self,
        raw: &'a str,
        wanted: impl Fn(&str) -> bool,
        read: impl FnOnce(&mut Self, usize) -> Result<(), Unreadable>,
    ) -> Result<(), Unreadable> {
        let start = self.entries.len();
        let request = matches!(self.out, Out::Leaves(_));
        let mut duplicated = false;
        let entries = &mut self.entries;
        for_each_entry(raw, self.budget, |key, value| {
            if !request {
                entries.push((key, value));
            } else if !duplicated && wanted(&key) {
                // Each read member is kept at most once, so a repeated one cannot grow `entries`.
                duplicated = entries
                    .get(start..)
                    .is_some_and(|kept| kept.iter().any(|(kept, _)| *kept == key));
                if !duplicated {
                    entries.push((key, value));
                }
            }
        })?;
        if duplicated {
            self.entries.truncate(start);
            return Err(Unreadable);
        }
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
        self.emit(emit, raw, span, &text);
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
            walker.read_object(
                item,
                |key| PART_FIELDS.contains(&key),
                |walker, start| {
                    for name in PART_FIELDS {
                        if let Some(field) = walker.member(start, name) {
                            walker.read_parts(emit, field, depth + 1)?;
                        }
                    }
                    Ok(())
                },
            )
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
            Some(b'{') => self.read_object(
                raw,
                |_| true,
                |walker, start| {
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
                },
            ),
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

    fn emit(&mut self, emit: Emit, raw: &str, span: Range<usize>, text: &str) {
        let collector = match &mut self.out {
            Out::Blocks(collector) => collector,
            Out::Leaves(sink) => {
                sink(TextLeaf { raw, text });
                return;
            }
        };
        let key = |slot| StreamKey {
            slot,
            index: [
                self.index.first().copied().unwrap_or(0),
                self.index.get(1).copied().unwrap_or(0),
            ],
        };
        match emit {
            Emit::Delta(stream) => {
                collector.push_delta(key(stream.slot), stream.json, span, text);
            }
            Emit::Summary(stream) => {
                collector.push_summary(key(stream.slot), stream.json, span, text);
            }
            Emit::Leaf { json, signable } => {
                let editable = !(signable && self.signed);
                collector.push_leaf(span, text, json, editable);
            }
            Emit::Copy => collector.attach_or_push_leaf(span, text),
            Emit::Signature => {
                if !text.is_empty() {
                    self.signed = true;
                    collector.mark_signed_thinking(self.index.first().copied().unwrap_or(0));
                }
            }
        }
    }

    fn charge(&mut self, bytes: usize) -> Result<(), Unreadable> {
        self.budget.charge(bytes).then_some(()).ok_or(Unreadable)
    }
}

/// Whether `object` or one of its cases reads member `key`.
fn wants(object: &Object, key: &str) -> bool {
    object.fields.iter().any(|(name, _)| *name == key)
        || object.index.contains(&key)
        || object.by.is_some_and(|by| {
            by.tag == key
                || by.cases.iter().any(|(_, case)| wants(case, key))
                || by.default.is_some_and(|default| wants(default, key))
        })
}

/// A value of the wrong type is skipped, or fails a `strict` read.
fn mismatch(strict: bool) -> Result<(), Unreadable> {
    if strict { Err(Unreadable) } else { Ok(()) }
}

/// Checks that `bytes` is one JSON value with no duplicated key in any object,
/// only finite numbers, and only strings a Rust string can hold.
pub(in crate::guardrails) fn validate(
    bytes: &[u8],
    budget: &mut ParseBudget,
) -> Result<(), ResponseParseError> {
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
