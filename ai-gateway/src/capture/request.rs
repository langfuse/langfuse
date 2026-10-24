//! Top-level view of a captured request body.
//!
//! Only the members a capture adapter reads are parsed; the recorded input is
//! the client's body as sent, so it retains about one body of memory.
use serde_json::{Value, value::RawValue};
use std::collections::HashMap;

/// Total raw bytes of parameters and metadata parsed per request.
const MAX_PARSED_BYTES: usize = 64 * 1024;

pub(super) struct RequestMembers<'a> {
    body: &'a [u8],
    /// A repeated key keeps its last value, like a parsed map.
    members: HashMap<String, &'a RawValue>,
    parsed_bytes: usize,
}

impl<'a> RequestMembers<'a> {
    pub(super) fn parse(body: &'a [u8]) -> serde_json::Result<Self> {
        Ok(Self {
            body,
            members: serde_json::from_slice(body)?,
            parsed_bytes: 0,
        })
    }

    /// Parses a member within the shared parse budget.
    pub(super) fn value(&mut self, key: &str) -> Option<Value> {
        let remaining = MAX_PARSED_BYTES - self.parsed_bytes;
        let (value, bytes) = self.parse_member(key, remaining)?;
        self.parsed_bytes += bytes;
        Some(value)
    }

    /// Parses a member no larger than `max_bytes`, outside the shared budget.
    pub(super) fn value_within(&self, key: &str, max_bytes: usize) -> Option<Value> {
        self.parse_member(key, max_bytes).map(|(value, _)| value)
    }

    fn parse_member(&self, key: &str, max_bytes: usize) -> Option<(Value, usize)> {
        let raw = self.members.get(key)?.get();
        if raw.len() > max_bytes {
            return None;
        }
        Some((serde_json::from_str(raw).ok()?, raw.len()))
    }

    /// The whole request as the client sent it, including the members read as facts.
    pub(super) fn into_input(self) -> Option<Box<RawValue>> {
        RawValue::from_string(String::from_utf8(self.body.to_vec()).ok()?).ok()
    }
}

#[cfg(test)]
mod tests;
