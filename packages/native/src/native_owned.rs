//! Field conversions called by `OtelStorageRow::into_prepared`.
//!
//! `IntoPrepared` converts dates, usage and costs to encoder types; `default_string`
//! supplies missing string values. `RestoreMediaField` visits strings inside row
//! fields so the caller can restore inline media after upload failures.

use std::collections::BTreeMap;

use serde_json::Value;

use crate::native_codec::{parse_datetime_text, parse_decimal, DateTime64Micros, Decimal64};
use crate::native_schema::DefaultPolicy;
use crate::otel::value::Number;

pub(crate) trait IntoPrepared<T> {
    fn into_prepared(self) -> Result<T, String>;
}

pub(crate) fn into_prepared<T, S: IntoPrepared<T>>(value: S, name: &str) -> Result<T, String> {
    value
        .into_prepared()
        .map_err(|error| format!("{name}: {error}"))
}

impl<T> IntoPrepared<T> for T {
    fn into_prepared(self) -> Result<T, String> {
        Ok(self)
    }
}

impl IntoPrepared<String> for Option<String> {
    fn into_prepared(self) -> Result<String, String> {
        Ok(self.unwrap_or_default())
    }
}

pub(crate) fn default_string(
    value: Option<String>,
    policy: DefaultPolicy,
    metadata_names: &[String],
    metadata_values: &[String],
) -> String {
    value.unwrap_or_else(|| match policy {
        DefaultPolicy::None | DefaultPolicy::MetadataEquals(_, _) => String::new(),
        DefaultPolicy::Literal(value) => value.to_owned(),
        DefaultPolicy::Metadata(key) => metadata(metadata_names, metadata_values, key)
            .unwrap_or_default()
            .to_owned(),
        DefaultPolicy::MetadataFallback(key, fallback) => {
            metadata(metadata_names, metadata_values, key)
                .filter(|value| !value.is_empty())
                .or_else(|| metadata(metadata_names, metadata_values, fallback))
                .unwrap_or_default()
                .to_owned()
        }
    })
}

impl IntoPrepared<DateTime64Micros> for String {
    fn into_prepared(self) -> Result<DateTime64Micros, String> {
        parse_datetime_text(&self, "datetime").map(DateTime64Micros)
    }
}

impl IntoPrepared<Option<DateTime64Micros>> for String {
    fn into_prepared(self) -> Result<Option<DateTime64Micros>, String> {
        parse_datetime_text(&self, "datetime")
            .map(DateTime64Micros)
            .map(Some)
    }
}

impl IntoPrepared<Option<DateTime64Micros>> for Option<String> {
    fn into_prepared(self) -> Result<Option<DateTime64Micros>, String> {
        self.map(|value| parse_datetime_text(&value, "datetime").map(DateTime64Micros))
            .transpose()
    }
}

impl IntoPrepared<BTreeMap<String, u64>> for BTreeMap<String, Value> {
    fn into_prepared(self) -> Result<BTreeMap<String, u64>, String> {
        self.into_iter()
            .map(|(key, value)| integral_from_value(value, &key).map(|value| (key, value)))
            .collect()
    }
}

impl IntoPrepared<BTreeMap<String, Decimal64>> for BTreeMap<String, Value> {
    fn into_prepared(self) -> Result<BTreeMap<String, Decimal64>, String> {
        let mut invalid_entries = 0;
        let mut first_error = None;
        let prepared = self
            .into_iter()
            .filter_map(|(key, value)| {
                let text = match value {
                    Value::Number(number) => number.to_string(),
                    Value::String(value) => value,
                    _ => {
                        invalid_entries += 1;
                        first_error.get_or_insert(format!("{key}: expected a numeric cost"));
                        return None;
                    }
                };
                match parse_decimal(&text, &key) {
                    Ok(value) => Some((key, Decimal64(value))),
                    Err(error) => {
                        invalid_entries += 1;
                        first_error.get_or_insert(error);
                        None
                    }
                }
            })
            .collect();
        if let Some(first_error) = first_error {
            tracing::warn!(
                invalid_entries,
                first_error = %first_error,
                "omitted invalid cost entries while preparing a ClickHouse row"
            );
        }
        Ok(prepared)
    }
}

fn metadata<'a>(names: &'a [String], values: &'a [String], key: &str) -> Option<&'a str> {
    names
        .iter()
        .zip(values)
        .find_map(|(name, value)| (name == key).then_some(value.as_str()))
}

fn integral_from_value(value: Value, name: &str) -> Result<u64, String> {
    let Value::Number(number) = value else {
        return Err(format!("{name}: expected a non-negative integral number"));
    };

    // Usage maps follow JS number spelling even when Rust retained an integer:
    // 2^63 is written to JSONEachRow as 9223372036854776000.
    let number = number
        .as_f64()
        .filter(|number| number.is_finite() && *number >= 0.0 && number.fract() == 0.0)
        .ok_or_else(|| format!("{name}: expected a non-negative integral number"))?;
    const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
    if number <= MAX_SAFE_INTEGER {
        return Ok(number as u64);
    }

    crate::otel::attributes::javascript_number_to_string(
        &Number::from_f64(number).ok_or_else(|| format!("{name}: expected a finite integer"))?,
    )
    .parse::<u64>()
    .map_err(|_| format!("{name}: expected a non-negative integer below 2^64"))
}

pub(crate) trait RestoreMediaField {
    fn restore_media(
        &mut self,
        restore: &mut impl FnMut(&mut String) -> Result<(), String>,
    ) -> Result<(), String>;
}

pub(crate) fn restore_field<T: RestoreMediaField>(
    field: &mut T,
    restore: &mut impl FnMut(&mut String) -> Result<(), String>,
) -> Result<(), String> {
    field.restore_media(restore)
}

impl<T: RestoreMediaField> RestoreMediaField for Option<T> {
    fn restore_media(
        &mut self,
        restore: &mut impl FnMut(&mut String) -> Result<(), String>,
    ) -> Result<(), String> {
        if let Some(value) = self {
            value.restore_media(restore)?;
        }
        Ok(())
    }
}

impl<T: RestoreMediaField> RestoreMediaField for Vec<T> {
    fn restore_media(
        &mut self,
        restore: &mut impl FnMut(&mut String) -> Result<(), String>,
    ) -> Result<(), String> {
        for value in self {
            value.restore_media(restore)?;
        }
        Ok(())
    }
}

impl<K: Ord, T: RestoreMediaField> RestoreMediaField for BTreeMap<K, T> {
    fn restore_media(
        &mut self,
        restore: &mut impl FnMut(&mut String) -> Result<(), String>,
    ) -> Result<(), String> {
        for value in self.values_mut() {
            value.restore_media(restore)?;
        }
        Ok(())
    }
}

impl RestoreMediaField for String {
    fn restore_media(
        &mut self,
        restore: &mut impl FnMut(&mut String) -> Result<(), String>,
    ) -> Result<(), String> {
        restore(self)
    }
}

impl RestoreMediaField for Value {
    fn restore_media(
        &mut self,
        restore: &mut impl FnMut(&mut String) -> Result<(), String>,
    ) -> Result<(), String> {
        match self {
            Value::String(value) => restore(value),
            Value::Array(values) => {
                for value in values {
                    value.restore_media(restore)?;
                }
                Ok(())
            }
            Value::Object(values) => {
                for value in values.values_mut() {
                    value.restore_media(restore)?;
                }
                Ok(())
            }
            Value::Null | Value::Bool(_) | Value::Number(_) => Ok(()),
        }
    }
}

macro_rules! no_media_field {
    ($($ty:ty),* $(,)?) => {$ (
        impl RestoreMediaField for $ty {
            fn restore_media(
                &mut self,
                _restore: &mut impl FnMut(&mut String) -> Result<(), String>,
            ) -> Result<(), String> {
                Ok(())
            }
        }
    )*};
}
no_media_field!(
    bool,
    u8,
    u16,
    u64,
    DateTime64Micros,
    Decimal64,
    crate::native_codec::SkillReference,
    crate::native_codec::SkillResourceLoaded,
);

#[cfg(test)]
mod tests {
    use super::{into_prepared, Decimal64, Value};
    use std::collections::BTreeMap;

    #[test]
    fn cost_values_keep_valid_entries_and_omit_invalid_values() {
        let prepared: BTreeMap<String, Decimal64> = into_prepared(
            BTreeMap::from([
                ("number".to_owned(), Value::from(0.5)),
                ("string".to_owned(), Value::String("0.25".to_owned())),
                (
                    "bad-string".to_owned(),
                    Value::String("not-a-number".to_owned()),
                ),
                ("bad-type".to_owned(), Value::Bool(true)),
            ]),
            "cost_details",
        )
        .expect("valid numeric costs should be prepared");

        assert_eq!(prepared["number"].0, 500_000_000_000);
        assert_eq!(prepared["string"].0, 250_000_000_000);
        assert!(!prepared.contains_key("bad-string"));
        assert!(!prepared.contains_key("bad-type"));
    }
}
