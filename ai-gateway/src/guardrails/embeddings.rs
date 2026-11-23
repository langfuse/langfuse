//! Embeddings have no conversation: all of `input`, a string or a list of strings,
//! is scanned. Token-id inputs hold no text.
use std::borrow::Cow;

use serde_json::value::RawValue;

use super::text;

pub(super) const MEMBERS: &[&str] = &["input"];

pub(super) fn last_turn<'a>(
    member: impl Fn(&str) -> Option<&'a str>,
    texts: &mut Vec<Cow<'a, str>>,
) {
    if let Some(input) = member("input").and_then(|raw| serde_json::from_str::<&RawValue>(raw).ok())
    {
        text::collect(input, texts);
    }
}
