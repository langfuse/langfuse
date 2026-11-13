//! Invariant tests for the JavaScript-compatible value representation.

use std::collections::hash_map::DefaultHasher;
use std::fmt::Write as _;
use std::hash::{Hash, Hasher};

use proptest::prelude::*;
use serde_json::Value as SerdeValue;

use super::value::{JsString, Value};

fn utf16_units() -> impl Strategy<Value = Vec<u16>> {
    let unit = prop_oneof![
        3 => 0x0000u16..=0xd7ff,
        5 => 0xd800u16..=0xdfff,
        3 => 0xe000u16..=0xffff,
    ];
    prop::collection::vec(unit, 0..=12)
}

fn utf8_string() -> impl Strategy<Value = String> {
    prop::collection::vec(any::<char>(), 0..=8).prop_map(|chars| chars.into_iter().collect())
}

struct Utf16Model {
    bytes: Vec<u8>,
    json: String,
    boundaries: Vec<(usize, usize)>,
}

impl Utf16Model {
    fn new(units: &[u16]) -> Self {
        let mut model = Self {
            bytes: Vec::new(),
            json: String::from('"'),
            boundaries: vec![(0, 0)],
        };
        let mut code_units = 0;
        for item in char::decode_utf16(units.iter().copied()) {
            match item {
                Ok(character) => {
                    model
                        .bytes
                        .extend_from_slice(character.encode_utf8(&mut [0; 4]).as_bytes());
                    let encoded = serde_json::to_string(&character.to_string()).unwrap();
                    model.json.push_str(&encoded[1..encoded.len() - 1]);
                    code_units += character.len_utf16();
                }
                Err(error) => {
                    let unit = error.unpaired_surrogate();
                    model.bytes.extend_from_slice(&[
                        0xed,
                        0x80 | ((unit >> 6) as u8 & 0x3f),
                        0x80 | (unit as u8 & 0x3f),
                    ]);
                    write!(model.json, r#"\u{unit:04x}"#).unwrap();
                    code_units += 1;
                }
            }
            model.boundaries.push((model.bytes.len(), code_units));
        }
        model.json.push('"');
        model
    }

    fn string(&self) -> JsString {
        JsString::from_wtf8(self.bytes.clone()).expect("generated units are valid WTF-8")
    }

    fn check(&self, value: &JsString) {
        assert_eq!(value.as_bytes(), self.bytes);
        assert_eq!(serde_json::to_string(value).unwrap(), self.json);
    }
}

fn digest<T: Hash>(value: &T) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn ordinary_json() -> impl Strategy<Value = SerdeValue> {
    let leaf = prop_oneof![
        Just(SerdeValue::Null),
        any::<bool>().prop_map(SerdeValue::Bool),
        any::<i64>().prop_map(|number| SerdeValue::Number(number.into())),
        any::<u64>().prop_map(|number| SerdeValue::Number(number.into())),
        utf8_string().prop_map(SerdeValue::String),
    ];
    leaf.prop_recursive(3, 32, 4, |inner| {
        prop_oneof![
            prop::collection::vec(inner.clone(), 0..=3).prop_map(SerdeValue::Array),
            prop::collection::vec((utf8_string(), inner), 0..=3)
                .prop_map(|entries| SerdeValue::Object(entries.into_iter().collect())),
        ]
    })
}

proptest! {
    #[test]
    fn strings_preserve_units_json_eq_and_hash(units in utf16_units()) {
        let model = Utf16Model::new(&units);
        let value = model.string();
        model.check(&value);
        prop_assert_eq!(value.as_str(), String::from_utf16_lossy(&units));
        prop_assert_eq!(value.as_str().len(), value.as_bytes().len());
        let parsed = Value::parse(&model.json).unwrap();
        let Value::String(parsed) = parsed else { panic!("expected string") };
        model.check(&parsed);

        let canonical = JsString::from_wtf8(value.as_bytes().to_vec()).unwrap();
        prop_assert_eq!(&value, &canonical);
        prop_assert_eq!(digest(&value), digest(&canonical));
        if let Ok(utf8) = String::from_utf16(&units) {
            let alternate = serde_json::from_value::<JsString>(utf8.into()).unwrap();
            prop_assert_eq!(&value, &alternate);
            prop_assert_eq!(digest(&value), digest(&alternate));
        }
    }

    #[test]
    fn append_and_edit_preserve_code_units(
        base in utf16_units(),
        source in utf16_units(),
        replacement in utf8_string(),
    ) {
        let source_model = Utf16Model::new(&source);
        let base_model = Utf16Model::new(&base);
        let source_value = source_model.string();
        for &(start, start_units) in &source_model.boundaries {
            for &(end, end_units) in source_model.boundaries.iter().filter(|(end, _)| *end >= start) {
                let mut appended = base_model.string();
                appended.push_slice(&source_value, start..end);
                let mut expected = base.clone();
                expected.extend_from_slice(&source[start_units..end_units]);
                Utf16Model::new(&expected).check(&appended);
            }
        }

        let mut pushed = base_model.string();
        pushed.push_str(&replacement);
        let mut expected = base.clone();
        expected.extend(replacement.encode_utf16());
        Utf16Model::new(&expected).check(&pushed);

        for &(start, start_units) in &base_model.boundaries {
            for &(end, end_units) in base_model.boundaries.iter().filter(|(end, _)| *end >= start) {
                let mut edited = base_model.string();
                edited.replace_range(start..end, &replacement);
                let mut expected = base[..start_units].to_vec();
                expected.extend(replacement.encode_utf16());
                expected.extend_from_slice(&base[end_units..]);
                Utf16Model::new(&expected).check(&edited);
            }
        }
    }

    #[test]
    fn ordinary_and_nested_fallback_keep_javascript_semantics(
        document in ordinary_json(),
        control in 0u8..32,
        computed in any::<u64>(),
    ) {
        let key = format!("a{}b", char::from(control));
        prop_assert!(Value::parse(&format!("{{\"{key}\":1}}")).is_err(), "raw control in key");
        let escaped = format!("{{{}:1}}", serde_json::to_string(&key).unwrap());
        prop_assert_eq!(Value::parse(&escaped).unwrap().to_json_string(), escaped);
        let json = serde_json::to_string(&document).unwrap();
        let expected = Value::from(document);
        let expected_json = expected.to_json_string();
        prop_assert_eq!(Value::parse(&json).unwrap(), expected);
        prop_assert_eq!(
            Value::from(computed).into_serde_lossy(),
            SerdeValue::from(computed)
        );
        let input = format!(r#"{{"\ud800":{},"nested":{{"\udc00":{},"overflow":1e309}}}}"#, json, json);
        let expected = format!(r#"{{"\ud800":{},"nested":{{"\udc00":{},"overflow":null}}}}"#, expected_json, expected_json);
        prop_assert_eq!(Value::parse(&input).unwrap().to_json_string(), expected);
    }
}
