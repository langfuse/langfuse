//! Estimate row and field heap allocations for V8 memory accounting.
//!
//! `RetainedSize` sums container capacity and child allocations; row types add
//! their own struct size. Map overhead is approximate. The result estimates
//! live Rust allocations for V8's external-memory counter.

use std::collections::BTreeMap;
use std::mem::size_of;

use indexmap::IndexMap;
use serde_json::Value;

use crate::native_codec::{DateTime64Micros, Decimal64, SkillReference, SkillResourceLoaded};
use crate::otel::types::{SkillAvailableInput, SkillResourceInput};
use crate::otel::value::{JsString, Value as OtelValue};

/// Estimate heap owned by a value. Container implementations add capacity and
/// recurse into children; row callers add the inline struct size for retained
/// objects.
pub(crate) trait RetainedSize {
    fn retained_bytes(&self) -> usize;
}

pub(crate) fn retained_size<T: RetainedSize + ?Sized>(value: &T) -> usize {
    value.retained_bytes()
}

impl RetainedSize for String {
    fn retained_bytes(&self) -> usize {
        self.capacity()
    }
}

impl RetainedSize for JsString {
    fn retained_bytes(&self) -> usize {
        JsString::retained_bytes(self)
    }
}

impl<T: RetainedSize> RetainedSize for Option<T> {
    fn retained_bytes(&self) -> usize {
        self.as_ref().map_or(0, RetainedSize::retained_bytes)
    }
}

impl<T: RetainedSize> RetainedSize for Vec<T> {
    fn retained_bytes(&self) -> usize {
        self.capacity() * size_of::<T>()
            + self.iter().map(RetainedSize::retained_bytes).sum::<usize>()
    }
}

impl<K: RetainedSize + Ord, V: RetainedSize> RetainedSize for BTreeMap<K, V> {
    fn retained_bytes(&self) -> usize {
        self.len() * (size_of::<K>() + size_of::<V>() + 32)
            + self
                .iter()
                .map(|(key, value)| key.retained_bytes() + value.retained_bytes())
                .sum::<usize>()
    }
}

impl<K: RetainedSize + Eq + std::hash::Hash, V: RetainedSize> RetainedSize for IndexMap<K, V> {
    fn retained_bytes(&self) -> usize {
        self.capacity() * (size_of::<(K, V)>() + size_of::<usize>())
            + self
                .iter()
                .map(|(key, value)| key.retained_bytes() + value.retained_bytes())
                .sum::<usize>()
    }
}

macro_rules! no_retained_heap {
    ($($ty:ty),* $(,)?) => {$ (
        impl RetainedSize for $ty {
            fn retained_bytes(&self) -> usize { 0 }
        }
    )*};
}

no_retained_heap!(
    bool,
    f64,
    u8,
    u16,
    u32,
    u64,
    i64,
    DateTime64Micros,
    Decimal64
);

macro_rules! string_fields {
    ($($ty:ty => [$($field:ident),+]),+ $(,)?) => {$ (
        impl RetainedSize for $ty {
            fn retained_bytes(&self) -> usize {
                0 $(+ self.$field.retained_bytes())+
            }
        }
    )+};
}

string_fields! {
    SkillReference => [langfuse_skill_id, skill_name],
    SkillResourceLoaded => [langfuse_skill_id, skill_name, file_path],
    SkillAvailableInput => [name],
    SkillResourceInput => [skill_name, file_path],
}

impl RetainedSize for Value {
    fn retained_bytes(&self) -> usize {
        match self {
            Self::String(value) => value.capacity(),
            Self::Array(values) => {
                values.capacity() * size_of::<Self>()
                    + values.iter().map(Self::retained_bytes).sum::<usize>()
            }
            Self::Object(values) => values
                .iter()
                .map(|(key, value)| {
                    key.capacity() + value.retained_bytes() + size_of::<(String, Value)>() + 32
                })
                .sum(),
            Self::Null | Self::Bool(_) | Self::Number(_) => 0,
        }
    }
}

impl RetainedSize for OtelValue {
    fn retained_bytes(&self) -> usize {
        match self {
            OtelValue::String(value) => value.retained_bytes(),
            OtelValue::Array(values) => values.retained_bytes(),
            OtelValue::Object(values) => values.retained_bytes(),
            OtelValue::Null | OtelValue::Bool(_) | OtelValue::Number(_) => 0,
        }
    }
}
