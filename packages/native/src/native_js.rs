//! Direct reads of finalized JavaScript rows into Rust-owned schema fields.
//! JS handles stay on the calling thread; only owned fields reach the async encoder.

use crate::native_codec::{parse_datetime_text, parse_decimal, DateTime64Micros, Decimal64};
use crate::native_schema::DefaultPolicy;
use napi::bindgen_prelude::{Array, JsObjectValue, Object, Unknown};
use napi::{JsNumber, JsValue};
use std::collections::BTreeMap;

/// Convert one schema field by reading its property directly from the JS object.
///
/// This is intentionally a small typed adapter rather than a generic serde bridge. It never
/// enumerates unrelated row properties, so fields such as `toJSON` cannot affect the input, and
/// it can reject unsafe JavaScript numbers before they are truncated into a Rust integer.
pub(crate) fn from_js_field<T: FromJsValue>(
    object: Object<'_>,
    key: &str,
    default_policy: DefaultPolicy,
    metadata: &MetadataValues,
) -> Result<T, String> {
    let value = get_js_property(&object, key)?;
    if is_missing(&value)? {
        T::missing(default_policy, metadata).map_err(|error| format!("{key}: {error}"))
    } else {
        T::from_js(value).map_err(|error| format!("{key}: {error}"))
    }
}

pub(crate) fn required_js_field<T: FromJsValue>(
    object: Object<'_>,
    key: &str,
) -> Result<T, String> {
    let value = get_js_property(&object, key)?;
    if is_missing(&value)? {
        return Err(format!(
            "{key} must be supplied by the finalized TypeScript row"
        ));
    }
    T::from_js(value).map_err(|error| format!("{key}: {error}"))
}

pub(crate) trait FromJsValue: Sized {
    fn from_js(value: Unknown<'_>) -> Result<Self, String>;

    fn missing(policy: DefaultPolicy, metadata: &MetadataValues) -> Result<Self, String>;
}

fn get_js_property<'env>(object: &Object<'env>, key: &str) -> Result<Unknown<'env>, String> {
    object
        .get_named_property_unchecked(key)
        .map_err(|error| format!("cannot read property {key}: {error}"))
}

/// Owned metadata arrays shared by metadata-backed defaults and the output columns.
/// The optional vectors are taken into the prepared row after all defaulted columns are read.
#[derive(Debug)]
pub(crate) struct MetadataValues {
    names: Vec<Option<String>>,
    values: Vec<Option<String>>,
}

impl MetadataValues {
    pub(crate) fn from_js(object: &Object<'_>) -> Result<Self, String> {
        Ok(Self {
            names: read_metadata_array(object, "metadata_names")?,
            values: read_metadata_array(object, "metadata_values")?,
        })
    }

    pub(crate) fn take_names(&mut self) -> Vec<String> {
        std::mem::take(&mut self.names)
            .into_iter()
            .map(Option::unwrap_or_default)
            .collect()
    }

    pub(crate) fn take_values(&mut self) -> Vec<String> {
        std::mem::take(&mut self.values)
            .into_iter()
            .map(Option::unwrap_or_default)
            .collect()
    }

    fn value(&self, name: &str) -> Result<Option<&str>, String> {
        // Defaults use the first matching name and ignore unmatched trailing values.
        for (metadata_name, metadata_value) in self.names.iter().zip(&self.values) {
            let metadata_name = metadata_name
                .as_deref()
                .ok_or_else(|| "expected a string, got null or undefined".to_owned())?;
            if metadata_name == name {
                return metadata_value
                    .as_deref()
                    .map(Some)
                    .ok_or_else(|| "expected a string, got null or undefined".to_owned());
            }
        }
        Ok(None)
    }
}

fn read_metadata_array(object: &Object<'_>, key: &str) -> Result<Vec<Option<String>>, String> {
    let value = get_js_property(object, key)?;
    if is_missing(&value)? {
        return Ok(Vec::new());
    }
    let array = js_array(value).map_err(|error| format!("{key}: {error}"))?;
    (0..array.len())
        .map(|index| {
            let value = array
                .get::<Unknown>(index)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| format!("missing array element {index}"))?;
            let value_type = value.get_type().map_err(|error| error.to_string())?;
            let value = match value_type {
                napi::ValueType::String => {
                    Some(unsafe { value.cast::<String>() }.map_err(|error| error.to_string())?)
                }
                napi::ValueType::Null | napi::ValueType::Undefined => None,
                value_type => {
                    return Err(format!("expected a string, got {value_type:?}"));
                }
            };
            Ok(value)
        })
        .collect::<Result<_, String>>()
        .map_err(|error| format!("{key}: {error}"))
}

fn is_missing(value: &Unknown<'_>) -> Result<bool, String> {
    Ok(matches!(
        value.get_type().map_err(|error| error.to_string())?,
        napi::ValueType::Null | napi::ValueType::Undefined
    ))
}

impl FromJsValue for String {
    fn from_js(value: Unknown<'_>) -> Result<Self, String> {
        match value.get_type().map_err(|error| error.to_string())? {
            napi::ValueType::String => {
                unsafe { value.cast::<String>() }.map_err(|error| error.to_string())
            }
            napi::ValueType::Null | napi::ValueType::Undefined => Ok(String::new()),
            value_type => Err(format!("expected a string, got {value_type:?}")),
        }
    }

    fn missing(policy: DefaultPolicy, metadata: &MetadataValues) -> Result<Self, String> {
        Ok(match policy {
            DefaultPolicy::Literal(value) => value.to_owned(),
            DefaultPolicy::Metadata(key) => metadata.value(key)?.unwrap_or_default().to_owned(),
            DefaultPolicy::MetadataFallback(key, fallback) => {
                let primary = metadata
                    .value(key)?
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned);
                match primary {
                    Some(value) => value,
                    None => metadata
                        .value(fallback)?
                        .filter(|value| !value.is_empty())
                        .unwrap_or_default()
                        .to_owned(),
                }
            }
            DefaultPolicy::MetadataEquals(_, _) | DefaultPolicy::None => String::new(),
        })
    }
}

impl FromJsValue for bool {
    fn from_js(value: Unknown<'_>) -> Result<Self, String> {
        match value.get_type().map_err(|error| error.to_string())? {
            napi::ValueType::Boolean => {
                unsafe { value.cast::<bool>() }.map_err(|error| error.to_string())
            }
            napi::ValueType::Number => {
                let number = js_number(value)?;
                if !number.is_finite() {
                    return Err("expected a finite boolean number".to_owned());
                }
                Ok(number != 0.0)
            }
            napi::ValueType::Null | napi::ValueType::Undefined => Ok(false),
            value_type => Err(format!("expected a boolean, got {value_type:?}")),
        }
    }

    fn missing(policy: DefaultPolicy, metadata: &MetadataValues) -> Result<Self, String> {
        Ok(match policy {
            DefaultPolicy::MetadataEquals(key, expected) => metadata.value(key)? == Some(expected),
            _ => false,
        })
    }
}

macro_rules! unsigned_js_value {
    ($($type:ty),+ $(,)?) => {
        $(
            impl FromJsValue for $type {
                fn from_js(value: Unknown<'_>) -> Result<Self, String> {
                    let number = js_u64(value, stringify!($type))?;
                    <$type>::try_from(number)
                        .map_err(|_| format!("value does not fit in {}", stringify!($type)))
                }

                fn missing(
                    _policy: DefaultPolicy,
                    _metadata: &MetadataValues,
                ) -> Result<Self, String> {
                    Ok(0)
                }
            }
        )+
    };
}
unsigned_js_value!(u8, u16, u64);

impl FromJsValue for DateTime64Micros {
    fn from_js(value: Unknown<'_>) -> Result<Self, String> {
        let value_type = value.get_type().map_err(|error| error.to_string())?;
        if value_type != napi::ValueType::String {
            return Err(format!(
                "expected a UTC timestamp string, got {value_type:?}"
            ));
        }
        let value: String = unsafe { value.cast() }.map_err(|error| error.to_string())?;
        parse_datetime_text(&value, "datetime").map(Self)
    }

    fn missing(_policy: DefaultPolicy, _metadata: &MetadataValues) -> Result<Self, String> {
        Err("datetime is required".to_owned())
    }
}

impl FromJsValue for Decimal64 {
    fn from_js(value: Unknown<'_>) -> Result<Self, String> {
        match value.get_type().map_err(|error| error.to_string())? {
            napi::ValueType::String => {
                let value: String = unsafe { value.cast() }.map_err(|error| error.to_string())?;
                parse_decimal(&value, "decimal").map(Self)
            }
            napi::ValueType::Number => {
                parse_decimal(&js_number(value)?.to_string(), "decimal").map(Self)
            }
            value_type => Err(format!(
                "expected a decimal number or string, got {value_type:?}"
            )),
        }
    }

    fn missing(_policy: DefaultPolicy, _metadata: &MetadataValues) -> Result<Self, String> {
        Err("decimal is required".to_owned())
    }
}

impl<T: FromJsValue> FromJsValue for Option<T> {
    fn from_js(value: Unknown<'_>) -> Result<Self, String> {
        if is_missing(&value)? {
            Ok(None)
        } else {
            T::from_js(value).map(Some)
        }
    }

    fn missing(_policy: DefaultPolicy, _metadata: &MetadataValues) -> Result<Self, String> {
        Ok(None)
    }
}

impl<T: FromJsValue> FromJsValue for Vec<T> {
    fn from_js(value: Unknown<'_>) -> Result<Self, String> {
        if is_missing(&value)? {
            return Ok(Vec::new());
        }
        let array = js_array(value)?;
        (0..array.len())
            .map(|index| {
                let value = array
                    .get::<Unknown>(index)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| format!("missing array element {index}"))?;
                T::from_js(value)
            })
            .collect()
    }

    fn missing(_policy: DefaultPolicy, _metadata: &MetadataValues) -> Result<Self, String> {
        Ok(Vec::new())
    }
}

impl<T: FromJsValue> FromJsValue for BTreeMap<String, T> {
    fn from_js(value: Unknown<'_>) -> Result<Self, String> {
        if is_missing(&value)? {
            return Ok(BTreeMap::new());
        }
        if value.get_type().map_err(|error| error.to_string())? != napi::ValueType::Object {
            return Err("expected an object map".to_owned());
        }
        let object: Object<'_> = unsafe { value.cast() }.map_err(|error| error.to_string())?;
        if object.is_array().map_err(|error| error.to_string())? {
            return Err("expected an object map, got an array".to_owned());
        }
        let keys = object
            .get_property_names()
            .map_err(|error| error.to_string())?;
        let length = keys
            .get_array_length_unchecked()
            .map_err(|error| error.to_string())?;
        let mut result = BTreeMap::new();
        for index in 0..length {
            let key: Unknown<'_> = keys.get_element(index).map_err(|error| error.to_string())?;
            let name: String = unsafe { key.cast() }.map_err(|error| error.to_string())?;
            // JSONEachRow includes only own enumerable string keys.
            if !object
                .has_own_property(&name)
                .map_err(|error| error.to_string())?
            {
                continue;
            }
            let value: Unknown<'_> = object
                .get_property_unchecked(key)
                .map_err(|error| format!("cannot read property {name}: {error}"))?;
            result.insert(name, T::from_js(value)?);
        }
        Ok(result)
    }

    fn missing(_policy: DefaultPolicy, _metadata: &MetadataValues) -> Result<Self, String> {
        Ok(BTreeMap::new())
    }
}

fn js_number(value: Unknown<'_>) -> Result<f64, String> {
    let number: JsNumber = unsafe { value.cast() }.map_err(|error| error.to_string())?;
    number.get_double().map_err(|error| error.to_string())
}

fn js_u64(value: Unknown<'_>, type_name: &str) -> Result<u64, String> {
    match value.get_type().map_err(|error| error.to_string())? {
        napi::ValueType::Number => {
            const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
            let js_number: JsNumber = unsafe { value.cast() }.map_err(|error| error.to_string())?;
            let number = js_number.get_double().map_err(|error| error.to_string())?;
            if !number.is_finite() || number < 0.0 || number.fract() != 0.0 {
                return Err(format!("expected a non-negative integral {type_name}"));
            }
            if number <= MAX_SAFE_INTEGER {
                return Ok(number as u64);
            }
            // TypeScript's JSONEachRow path serializes large integral Numbers using the
            // shortest decimal representation (for example, 2**63 becomes
            // `9223372036854776000`). Parse that scalar spelling rather than casting the
            // binary float, which would silently change the value before ClickHouse sees it.
            js_number
                .coerce_to_string()
                .map_err(|error| error.to_string())?
                .into_utf8()
                .map_err(|error| error.to_string())?
                .as_str()
                .map_err(|error| error.to_string())?
                .parse::<u64>()
                .map_err(|_| format!("expected a non-negative {type_name} below 2^64"))
        }
        value_type => Err(format!("expected a {type_name}, got {value_type:?}")),
    }
}

fn js_array(value: Unknown<'_>) -> Result<Array<'_>, String> {
    if value.get_type().map_err(|error| error.to_string())? != napi::ValueType::Object {
        return Err("expected an array".to_owned());
    }
    let object: Object<'_> = unsafe { value.cast() }.map_err(|error| error.to_string())?;
    if !object.is_array().map_err(|error| error.to_string())? {
        return Err("expected an array".to_owned());
    }
    unsafe { value.cast() }.map_err(|error| error.to_string())
}
