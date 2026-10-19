//! Top-level projection of a captured request body.
//!
//! Only the members a capture adapter projects into facts are parsed; prompt
//! content stays as the client's raw JSON so it retains about one body of memory.
use serde::de::{self, DeserializeSeed, Deserializer, IgnoredAny, MapAccess, Visitor};
use serde_json::{Value, value::RawValue};
use std::{borrow::Cow, fmt};

/// Total raw bytes of projected parameters and metadata parsed per request.
/// Larger members stay in the recorded input, where they cost raw bytes only.
const MAX_PROJECTED_BYTES: usize = 64 * 1024;

pub(super) struct RequestMembers<'a> {
    projected: Vec<(&'static str, &'a RawValue)>,
    /// Remaining members as an unterminated JSON object; full mode only.
    input: Option<Vec<u8>>,
    projected_bytes: usize,
}

impl<'a> RequestMembers<'a> {
    /// Splits a JSON object into the named members and, if `keep_input`, the rest.
    /// A repeated projected key keeps its last value, like a parsed map.
    pub(super) fn parse(
        body: &'a [u8],
        keys: &[&'static str],
        keep_input: bool,
    ) -> serde_json::Result<Self> {
        let mut deserializer = serde_json::Deserializer::from_slice(body);
        let members = Split {
            keys,
            input_capacity: keep_input.then_some(body.len()),
        }
        .deserialize(&mut deserializer)?;
        deserializer.end()?;
        Ok(members)
    }

    /// Parses a projected member within the shared projection budget.
    pub(super) fn take_value(&mut self, key: &str) -> Option<Value> {
        let remaining = MAX_PROJECTED_BYTES - self.projected_bytes;
        let (value, bytes) = self.take(key, remaining, |_| true)?;
        self.projected_bytes += bytes;
        Some(value)
    }

    /// Parses a projected member no larger than `max_bytes` that `accept`s,
    /// outside the shared budget. A rejected member stays in the input.
    pub(super) fn take_value_within(
        &mut self,
        key: &str,
        max_bytes: usize,
        accept: impl FnOnce(&Value) -> bool,
    ) -> Option<Value> {
        self.take(key, max_bytes, accept).map(|(value, _)| value)
    }

    fn take(
        &mut self,
        key: &str,
        max_bytes: usize,
        accept: impl FnOnce(&Value) -> bool,
    ) -> Option<(Value, usize)> {
        let position = self.projected.iter().position(|(name, _)| *name == key)?;
        let raw = self.projected[position].1.get();
        if raw.len() > max_bytes {
            return None;
        }
        let value = serde_json::from_str(raw).ok().filter(accept)?;
        self.projected.remove(position);
        Some((value, raw.len()))
    }

    /// The unprojected members, in request order, followed by any projected
    /// member that was not taken.
    pub(super) fn into_input(self) -> Option<Box<RawValue>> {
        let mut input = self.input?;
        for (key, value) in self.projected {
            append_member(&mut input, key, value).ok()?;
        }
        input.push(b'}');
        RawValue::from_string(String::from_utf8(input).ok()?).ok()
    }
}

fn append_member(input: &mut Vec<u8>, key: &str, value: &RawValue) -> serde_json::Result<()> {
    if input.len() > 1 {
        input.push(b',');
    }
    serde_json::to_writer(&mut *input, key)?;
    input.push(b':');
    input.extend_from_slice(value.get().as_bytes());
    Ok(())
}

struct Split<'k> {
    keys: &'k [&'static str],
    input_capacity: Option<usize>,
}

impl<'de> DeserializeSeed<'de> for Split<'_> {
    type Value = RequestMembers<'de>;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Self::Value, D::Error> {
        deserializer.deserialize_map(self)
    }
}

impl<'de> Visitor<'de> for Split<'_> {
    type Value = RequestMembers<'de>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a JSON object")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut members = RequestMembers {
            projected: Vec::new(),
            input: self.input_capacity.map(|capacity| {
                let mut input = Vec::with_capacity(capacity);
                input.push(b'{');
                input
            }),
            projected_bytes: 0,
        };
        while let Some(Key(key)) = map.next_key()? {
            if let Some(&name) = self.keys.iter().find(|name| **name == key) {
                let value: &'de RawValue = map.next_value()?;
                members
                    .projected
                    .retain(|(projected, _)| *projected != name);
                members.projected.push((name, value));
            } else if let Some(input) = &mut members.input {
                let value: &'de RawValue = map.next_value()?;
                append_member(input, &key, value).map_err(de::Error::custom)?;
            } else {
                map.next_value::<IgnoredAny>()?;
            }
        }
        Ok(members)
    }
}

/// An object key, borrowed from the body unless it contains escapes.
struct Key<'de>(Cow<'de, str>);

impl<'de> de::Deserialize<'de> for Key<'de> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_str(KeyVisitor)
    }
}

struct KeyVisitor;

impl<'de> Visitor<'de> for KeyVisitor {
    type Value = Key<'de>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("an object key")
    }

    fn visit_borrowed_str<E: de::Error>(self, value: &'de str) -> Result<Self::Value, E> {
        Ok(Key(Cow::Borrowed(value)))
    }

    fn visit_str<E: de::Error>(self, value: &str) -> Result<Self::Value, E> {
        Ok(Key(Cow::Owned(value.to_owned())))
    }

    fn visit_string<E: de::Error>(self, value: String) -> Result<Self::Value, E> {
        Ok(Key(Cow::Owned(value)))
    }
}

#[cfg(test)]
mod tests;
