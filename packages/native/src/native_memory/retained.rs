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
use crate::otel::types::{OwnedEvent, SkillAvailableInput, SkillResourceInput, StorageContext};
use crate::otel::value::{JsString, Value as OtelValue};
use crate::otel_pipeline::OtelOverflowRequest;

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

impl<T: RetainedSize> RetainedSize for Box<T> {
    fn retained_bytes(&self) -> usize {
        size_of::<T>() + retained_size(self.as_ref())
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

macro_rules! retained_fields {
    ($($ty:ty => [$($field:ident),+ $(,)?]),+ $(,)?) => {$ (
        impl RetainedSize for $ty {
            fn retained_bytes(&self) -> usize {
                let Self { $($field),+ } = self;
                0 $(+ retained_size($field))+
            }
        }
    )+};
}

retained_fields! {
    SkillReference => [langfuse_skill_id, skill_version, skill_name],
    SkillResourceLoaded => [langfuse_skill_id, skill_version, skill_name, file_path],
    SkillAvailableInput => [name, version],
    SkillResourceInput => [skill_name, file_path, skill_version],
    StorageContext => [blob_storage_file_path, created_at, updated_at, event_ts],
    OtelOverflowRequest => [
        index, event_index, trace_id, observation_id, field, metadata_index, byte_length, sha256_hash,
    ],
    OwnedEvent => [
        row, prompt_version_lookup, evaluation_fields, model_parameters, provided_usage_details,
        provided_cost_details, gateway_calculated_cost, input, output, metadata, skills_available,
        skills_resource_loaded,
    ],
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
