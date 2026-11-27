//! Where API formats carry the text guardrails scan, in requests and responses,
//! declared per format in its [`crate::capture`] module as a tree of [`Node`]s.
//! [`walker`] reads a JSON value along such a tree.

pub(crate) mod walker;

use crate::guardrails::text::{LastTurn, Unreadable};

/// Stream indices one [`Object`] may declare: a stream key holds two.
const MAX_INDEX: usize = 2;

/// One value in a response, and how to read the text below it.
#[derive(Clone, Copy, Debug)]
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
    /// Every node, each reading the same value.
    OneOf(&'static [Node]),
    /// Each member value of an object, in order and duplicates included.
    Values(&'static Node),
}

/// An object and the fields that lead to text, read in this order. A null field
/// is absent; a `strict` object fails the read when the value, such as an array
/// item, is anything else.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Object {
    strict: bool,
    index: &'static [&'static str],
    fields: &'static [(&'static str, Node)],
    by: Option<Switch>,
}

/// More fields of the same object, chosen by the string in its `tag` field.
#[derive(Clone, Copy, Debug)]
struct Switch {
    tag: &'static str,
    cases: &'static [(&'static str, Object)],
    default: Option<&'static Object>,
}

/// The JSON a text field may hold.
#[derive(Clone, Copy, Debug)]
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
#[derive(Clone, Copy, Debug)]
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
#[derive(Clone, Copy, Debug)]
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

/// A content part: its `text`, the text of a document `source` (plain `data`, or
/// nested `content` blocks), and nested `content` such as a tool result's.
macro_rules! part {
    ($nested:expr) => {
        Object::new(&[
            ("text", text(LEAF)),
            (
                "source",
                Object::new(&[])
                    .by(
                        "type",
                        &[
                            ("text", Object::new(&[("data", text(LEAF))])),
                            ("content", Object::new(&[("content", $nested)])),
                        ],
                        None,
                    )
                    .node(),
            ),
            ("content", $nested),
        ])
        .node()
    };
}

/// A string, or an array of strings and content parts.
macro_rules! content {
    ($part:expr) => {
        Node::OneOf(&[
            text(LEAF),
            Node::Items {
                item: &Node::OneOf(&[text(LEAF), $part]),
                keyed: false,
                strict: false,
            },
        ])
    };
}

/// Request text in the shape the formats share: a string, or an array of
/// strings and parts; images, files and other parts hold none. Tool results nest
/// content once; deeper part arrays are not a shape any format defines.
pub(crate) const CONTENT: Node = content!(PART);
/// One content part.
pub(crate) const PART: Node = part!(NESTED_CONTENT);
const NESTED_CONTENT: Node = content!(NESTED_PART);
const NESTED_PART: Node = part!(INNER_CONTENT);
const INNER_CONTENT: Node = content!(INNER_PART);
const INNER_PART: Node = part!(text(LEAF));
/// A conversation message whose `content` holds its text, as in Chat
/// Completions and Anthropic Messages.
pub(crate) const ROLE_MESSAGE: Node = Object::new(&[("content", CONTENT)]).node();

/// Where a request in one API format carries the conversation guardrails scan.
pub(crate) struct RequestSpec {
    /// The top-level members the request parse locates; reading any other is
    /// unreadable.
    pub members: &'static [&'static str],
    /// Finds the last turn among `members`.
    pub last_turn: fn(&Members<'_, '_>) -> Result<LastTurn, Unreadable>,
}

/// A request's top-level members, by name.
pub(crate) struct Members<'f, 'a> {
    declared: &'static [&'static str],
    find: &'f dyn Fn(&str) -> Option<&'a str>,
}

impl<'f, 'a> Members<'f, 'a> {
    pub(crate) fn new(
        declared: &'static [&'static str],
        find: &'f dyn Fn(&str) -> Option<&'a str>,
    ) -> Self {
        Self { declared, find }
    }

    /// The JSON of member `name`, if the request has it. A member its format
    /// does not declare is unreadable: the request parse never located it, so
    /// it would read as absent and its text would go unscanned.
    pub(crate) fn get(&self, name: &str) -> Result<Option<&'a str>, Unreadable> {
        if self.declared.contains(&name) {
            Ok((self.find)(name))
        } else {
            Err(Unreadable)
        }
    }
}
