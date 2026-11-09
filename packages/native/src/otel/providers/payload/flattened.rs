//! Rebuild nested JSON from dotted attribute names.
//!
//! With prefix `gen_ai.prompt`, `gen_ai.prompt.0.role = "user"` produces
//! `[{"role":"user"}]`. `flattened_payload` accepts paths within the nesting and array
//! allocation limits. A truthy value at the exact prefix takes precedence over dotted keys.

use std::collections::{HashMap, HashSet};

use super::super::super::attributes::is_js_truthy;
use super::super::super::types::JsonObject;
use super::super::super::value::{JsString, Value};

pub(super) const MAX_ARRAY_SLOTS: usize = 10_001;
const MAX_PATH_DEPTH: usize = 64;

pub(super) fn flattened_payload(attributes: &JsonObject, prefix: &str) -> Option<Value> {
    // Use a truthy exact value when present; otherwise reconstruct from dotted keys.
    if let Some(value) = attributes.get(prefix).filter(|value| is_js_truthy(value)) {
        return Some(value.clone());
    }
    let marker = format!("{prefix}.");
    let paths = attributes
        .iter()
        .filter_map(|(key, value)| {
            let parts = split_wtf8_path(&key.strip_prefix(&marker)?);
            let valid = parts.len() <= MAX_PATH_DEPTH
                && parts.iter().all(|part| {
                    !part.is_empty()
                        && !matches!(
                            part.as_utf8(),
                            Some("__proto__" | "constructor" | "prototype")
                        )
                        && canonical_array_index_js(part)
                            .is_none_or(|index| index < MAX_ARRAY_SLOTS)
                });
            valid.then_some((parts, value))
        })
        .collect::<Vec<_>>();
    if paths.is_empty() {
        return attributes
            .keys()
            .any(|key| key.as_bytes().starts_with(prefix.as_bytes()))
            .then(|| Value::Object(JsonObject::new()));
    }
    let mut root_budget = ArraySlotBudget::default();
    let mut root = if paths.iter().any(|(parts, _)| {
        root_budget.try_reserve(parts)
            && parts.len() > 1
            && canonical_array_index_js(&parts[0]).is_some()
    }) {
        Value::Array(Vec::new())
    } else {
        Value::Object(JsonObject::new())
    };
    // A recorded path contains an attribute's value. Other containers and null array
    // slots were created by reconstruction and can receive later dotted fields.
    let mut written = HashSet::new();
    let mut budget = ArraySlotBudget::default();
    for (parts, value) in &paths {
        if can_insert_path(&root, parts, &written) && budget.try_reserve(parts) {
            insert_path(&mut root, parts, value);
            written.insert(parts.as_slice());
        }
    }
    Some(root)
}

fn split_wtf8_path(value: &JsString) -> Vec<JsString> {
    value
        .as_bytes()
        .split(|byte| *byte == b'.')
        .map(|part| JsString::from_wtf8(part.to_vec()).expect("WTF-8 path segment"))
        .collect()
}

fn canonical_array_index(value: &str) -> Option<usize> {
    if value == "0"
        || (value
            .as_bytes()
            .first()
            .is_some_and(|byte| byte.is_ascii_digit() && *byte != b'0')
            && value.bytes().all(|byte| byte.is_ascii_digit()))
    {
        // Keep overflowing digit-only segments classified as oversized indices so
        // path validation rejects them along with indices above the allocation limit.
        return Some(value.parse::<usize>().unwrap_or(usize::MAX));
    }
    None
}

fn canonical_array_index_js(value: &JsString) -> Option<usize> {
    value.as_utf8().and_then(canonical_array_index)
}

/// Reserve all array growth before writing a path. Borrowing path prefixes keeps
/// bookkeeping proportional to attribute paths, including for large sparse indices.
#[derive(Default)]
struct ArraySlotBudget<'a> {
    used: usize,
    lengths: HashMap<&'a [JsString], usize>,
}

impl<'a> ArraySlotBudget<'a> {
    fn try_reserve(&mut self, path: &'a [JsString]) -> bool {
        let arrays = path.iter().enumerate().filter_map(|(depth, key)| {
            canonical_array_index_js(key).map(|index| (&path[..depth], index + 1))
        });
        let additional: usize = arrays
            .clone()
            .map(|(prefix, length)| length.saturating_sub(*self.lengths.get(prefix).unwrap_or(&0)))
            .sum();
        if self.used + additional > MAX_ARRAY_SLOTS {
            return false;
        }
        self.used += additional;
        for (prefix, length) in arrays {
            self.lengths
                .entry(prefix)
                .and_modify(|old| *old = (*old).max(length))
                .or_insert(length);
        }
        true
    }
}

fn can_insert_path(mut current: &Value, path: &[JsString], written: &HashSet<&[JsString]>) -> bool {
    for (depth, key) in path.iter().enumerate() {
        let child = match current {
            Value::Object(object) => object.get(key),
            Value::Array(array) => {
                let Some(index) = canonical_array_index_js(key) else {
                    return false;
                };
                array.get(index)
            }
            _ => return false,
        };
        let Some(child) = child else {
            return true;
        };
        let explicit = written.contains(&path[..=depth]);
        if depth + 1 == path.len() {
            return explicit || !(child.is_object() || child.is_array());
        }
        if explicit {
            return false;
        }
        if child.is_null() {
            return true;
        }
        current = child;
    }
    false
}

/// Commit a path after conflict checking and budget reservation have succeeded.
fn insert_path(current: &mut Value, parts: &[JsString], value: &Value) {
    let key = &parts[0];
    let slot = match current {
        Value::Object(object) => object.entry(key.clone()).or_insert(Value::Null),
        Value::Array(array) => {
            let index = canonical_array_index_js(key).expect("validated array index");
            if index >= array.len() {
                array.resize_with(index + 1, || Value::Null);
            }
            &mut array[index]
        }
        _ => unreachable!("validated container"),
    };
    if parts.len() == 1 {
        *slot = value.clone();
    } else {
        if slot.is_null() {
            *slot = if canonical_array_index_js(&parts[1]).is_some() {
                Value::Array(Vec::new())
            } else {
                Value::Object(JsonObject::new())
            };
        }
        insert_path(slot, &parts[1..], value);
    }
}
