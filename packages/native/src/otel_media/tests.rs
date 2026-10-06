use super::encoding::BASE64;
use super::json::MAX_JSON_DEPTH;
use super::payload::{EarlyMediaError, MediaEncoding, MediaPayloadKind, MediaSource};
use super::rules::{may_contain_media_candidate, MEDIA_REFERENCE_PREFIX};
use super::scanner::media_identity_from_encoded;
use super::{extract_media, validate_and_discover};
use base64::Engine;
use proptest::prelude::*;
use serde_json::{json, Value};

pub(super) fn json_string_strategy() -> BoxedStrategy<String> {
    prop::collection::vec(any::<char>(), 0..32)
        .prop_map(|characters| characters.into_iter().collect())
        .boxed()
}

pub(super) fn json_value_strategy(depth: u8) -> BoxedStrategy<Value> {
    let scalar = prop_oneof![
        Just(Value::Null),
        any::<bool>().prop_map(Value::Bool),
        any::<i64>().prop_map(|value| Value::Number(value.into())),
        any::<u64>().prop_map(|value| Value::Number(value.into())),
        any::<f64>().prop_filter_map("finite JSON number", |value| {
            serde_json::Number::from_f64(value).map(Value::Number)
        }),
        json_string_strategy().prop_map(Value::String),
    ]
    .boxed();
    if depth == 0 {
        return scalar;
    }

    prop_oneof![
        scalar,
        prop::collection::vec(json_value_strategy(depth - 1), 0..5).prop_map(Value::Array),
        prop::collection::vec(
            (json_string_strategy(), json_value_strategy(depth - 1)),
            0..5,
        )
        .prop_map(|fields| {
            let mut object = serde_json::Map::new();
            for (key, value) in fields {
                object.insert(key, value);
            }
            Value::Object(object)
        }),
    ]
    .boxed()
}

pub(super) fn data_uri(payload: &[u8]) -> String {
    format!("data:image/png;base64,{}", BASE64.encode(payload))
}

#[test]
fn validates_and_extracts_data_uri_without_parsing_a_value_tree() {
    let uri = data_uri(b"image");
    let input = format!(r#"{{"input":"before {uri} after"}}"#);
    let result = extract_media(input.as_bytes()).expect("valid JSON");

    assert_eq!(result.media.len(), 1);
    assert!(String::from_utf8_lossy(&result.compact_json)
        .contains("@@@langfuseMedia:type=image/png|id="));
    assert_eq!(result.media[0].decode().unwrap(), b"image");
    assert_eq!(result.media[0].original_value().unwrap(), uri);
    assert_eq!(result.media[0].kind, MediaPayloadKind::DataUri);
}

#[test]
fn restarts_data_uri_detection_after_malformed_prefixes() {
    for prefix in ["data:malformed@", "data:broken ", "data:bad,", "data:"] {
        let input = json!({"input": format!("{prefix}data:image/png;base64,aGk=")});
        let result = extract_media(&serde_json::to_vec(&input).unwrap()).unwrap();
        assert_eq!(result.media.len(), 1, "prefix: {prefix}");
        assert_eq!(result.media[0].decode().unwrap(), b"hi");
        let compact: Value = serde_json::from_slice(&result.compact_json).unwrap();
        assert_eq!(
            compact["input"],
            format!("{prefix}{}", result.media[0].reference)
        );
    }
    let input = json!({"input": "data: ".repeat(10_000)});
    let source = serde_json::to_vec(&input).unwrap();
    let result = extract_media(&source).unwrap();
    assert!(result.media.is_empty());
    assert_eq!(result.compact_json, source);
}

#[test]
fn structured_media_uses_the_last_duplicate_field_like_json_parse() {
    for input in [
        r#"{"type":"file","mediaType":"image/png","data":"YWJj","data":"ZGVm"}"#,
        r#"{"type":"other","type":"file","mediaType":"text/plain","mediaType":"image/png","data":"ZGVm"}"#,
        r#"{"inline_data":{"mime_type":"image/png","data":"YWJj"},"inline_data":{"mime_type":"image/png","data":"YWJj","data":"ZGVm"}}"#,
        r#"{"inline_data":{"mime_type":"image/png","mimeType":"text/plain","data":"ZGVm"}}"#,
        r#"{"inline_data":{"mime_type":null,"mimeType":"image/png","data":"ZGVm"}}"#,
    ] {
        let result = extract_media(input.as_bytes()).unwrap();
        assert_eq!(result.media.len(), 1, "{input}");
        assert_eq!(result.media[0].decode().unwrap(), b"def");
        assert_eq!(result.media[0].content_type, "image/png");
        let compact: Value = serde_json::from_slice(&result.compact_json).unwrap();
        let stored = if compact.get("inline_data").is_some() {
            &compact["inline_data"]["data"]
        } else {
            &compact["data"]
        };
        assert_eq!(stored, &json!(result.media[0].reference));
    }
}

#[test]
fn nested_otlp_map_keys_stay_structural() {
    let uri = data_uri(b"nested-map");
    let attributes = json!([{"key": "metadata", "value": {"arrayValue": {"values": [
        {"kvlistValue": {"values": [{"key": uri, "value": {"stringValue": uri}}]}}
    ]}}}]);
    let input = json!({"resourceSpans": [{"resource": {"attributes": attributes}}]});
    let result = extract_media(&serde_json::to_vec(&input).unwrap()).unwrap();
    assert_eq!(result.media.len(), 1);
    let compact: Value = serde_json::from_slice(&result.compact_json).unwrap();
    let entry = &compact["resourceSpans"][0]["resource"]["attributes"][0]["value"]["arrayValue"]
        ["values"][0]["kvlistValue"]["values"][0];
    assert_eq!(entry["key"], uri);
    assert_eq!(entry["value"]["stringValue"], result.media[0].reference);
}

#[test]
fn accepts_deep_otlp_structure_before_embedded_json_limit() {
    let mut value = r#""leaf""#.to_owned();
    for _ in 0..16 {
        value = format!(r#"{{"nested":{value}}}"#);
    }

    let result = extract_media(value.as_bytes()).expect("deep OTLP JSON is valid");
    assert!(result.media.is_empty());
}

#[test]
fn enforces_the_json_depth_limit_for_empty_and_nonempty_containers() {
    let nested_array = |leaf: &str, depth: usize| {
        (0..depth).fold(leaf.to_owned(), |value, _| format!("[{value}]"))
    };
    let nested_object = |leaf: &str, depth: usize| {
        (0..depth).fold(leaf.to_owned(), |value, _| format!(r#"{{"x":{value}}}"#))
    };

    for value in [
        nested_array("null", MAX_JSON_DEPTH),
        nested_array("[]", MAX_JSON_DEPTH),
        nested_object("null", MAX_JSON_DEPTH),
        nested_object("{}", MAX_JSON_DEPTH),
    ] {
        extract_media(value.as_bytes()).expect("JSON at the depth limit is accepted");
    }

    for value in [
        nested_array("null", MAX_JSON_DEPTH + 1),
        nested_array("[]", MAX_JSON_DEPTH + 1),
        nested_object("null", MAX_JSON_DEPTH + 1),
        nested_object("{}", MAX_JSON_DEPTH + 1),
    ] {
        assert!(matches!(
            extract_media(value.as_bytes()),
            Err(EarlyMediaError::NestingLimit { .. })
        ));
    }
}

#[test]
fn preserves_json_escaping_and_scans_nested_stringified_json() {
    let nested = format!(
        r#"{{"type":"base64","media_type":"image/png","data":"{}"}}"#,
        BASE64.encode(b"nested")
    );
    let encoded_nested = serde_json::to_string(&nested).expect("serialize nested JSON");
    let input = format!(r#"{{"text":{encoded_nested}}}"#);
    let result = extract_media(input.as_bytes()).expect("valid JSON");

    assert_eq!(result.media.len(), 1);
    let compact = String::from_utf8(result.compact_json).unwrap();
    assert!(compact.contains("@@@langfuseMedia:type=image/png|id="));
    assert_eq!(result.media[0].kind, MediaPayloadKind::Anthropic);
    assert_eq!(
        result.media[0].original_value().unwrap(),
        BASE64.encode(b"nested")
    );
}

#[test]
fn scans_unicode_escaped_provider_keys_in_nested_json() {
    let nested = r#"{"type":"base64","media_\u0074ype":"image/png","data":"aGk="}"#;
    let encoded_nested = serde_json::to_string(nested).expect("serialize nested JSON");
    let input = format!(r#"{{"text":{encoded_nested}}}"#);

    let result = extract_media(input.as_bytes()).expect("valid nested provider JSON");

    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].decode().unwrap(), b"hi");
}

#[test]
fn recognizes_provider_shapes_and_python_bytes() {
    let encoded = BASE64.encode(b"provider");
    let input = format!(
        r#"[{{"type":"media","mime_type":"image/png","data":"{encoded}"}},{{"type":"file","mediaType":"image/png","data":"b'abc\\x64'"}}]"#
    );
    let result = extract_media(input.as_bytes()).expect("valid JSON");
    assert_eq!(result.media.len(), 2);
    assert_eq!(result.media[0].kind, MediaPayloadKind::Vertex);
    assert_eq!(result.media[1].kind, MediaPayloadKind::AiSdkV6);
    assert_eq!(result.media[1].decode().unwrap(), b"abcd");
}

#[test]
fn media_prefilter_is_conservative_for_structured_and_escaped_candidates() {
    // Buffer-like OTLP fields contain `type` and `data`, but are not media
    // candidates and should take the validation-only path.
    assert!(!may_contain_media_candidate(
        r#"{"traceId":{"type":"Buffer","data":[1,2,3]}}"#
    ));
    assert!(may_contain_media_candidate(
        r#"{"type":"media","mime_type":"image/png","data":"aGk="}"#
    ));
    // Provider objects embedded in OTLP string attributes contain escaped
    // quotes; the literal MIME marker keeps them on the full detector path.
    assert!(may_contain_media_candidate(
        r#"{"text":"{\"type\":\"base64\",\"media_type\":\"image/png\",\"data\":\"aGk=\"}"}"#
    ));
    // A marker written with JSON Unicode escapes must not be optimized away.
    assert!(may_contain_media_candidate(
        r#"{"text":"\u0064ata:image/png;base64,aGk="}"#
    ));
}

#[test]
fn validation_only_path_preserves_valid_json_and_rejects_trailing_bytes() {
    let input = br#"{"traceId":{"type":"Buffer","data":[1,2,3]},"text":"plain"}"#;
    let validated = validate_and_discover(input.to_vec()).expect("valid JSON");
    assert!(validated.manifest.entries.is_empty());
    assert_eq!(validated.into_source(), input);

    let mut invalid = input.to_vec();
    invalid.push(b'x');
    assert!(matches!(
        validate_and_discover(invalid),
        Err(EarlyMediaError::TrailingBytes { .. })
    ));
}

#[test]
fn validates_large_numbers_without_converting_them_to_floats_or_integers() {
    let long_integer = "9".repeat(5_000);
    let input = format!(
        r#"{{"longInteger":{long_integer},"overflowingExponent":1e999999,"underflowingExponent":-1e-999999,"lexicalFloat":1.2300E+004}}"#
    );

    let result = extract_media(input.as_bytes()).expect("valid JSON number lexemes");
    assert!(result.media.is_empty());
    assert_eq!(result.compact_json, input.as_bytes());
}

#[test]
fn structured_data_uri_must_occupy_the_entire_provider_field() {
    let input =
        br#"{"type":"file","mediaType":"image/png","data":"data:image/png;base64,aGk= trailing"}"#;
    let result = extract_media(input).expect("valid JSON");
    assert!(result.media.is_empty());
    assert_eq!(result.compact_json, input);
}

#[test]
fn matches_data_uri_parameter_validation() {
    let valid = br#"{"type":"file","mediaType":"image/png","data":"data:image/png;charset=utf-8;base64,aGk="}"#;
    let result = extract_media(valid).expect("valid JSON");
    assert_eq!(result.media.len(), 1);

    let invalid = br#"{"type":"file","mediaType":"image/png","data":"data:image/png;charset=not valid;base64,aGk="}"#;
    let result = extract_media(invalid).expect("valid JSON");
    assert!(result.media.is_empty());
    assert_eq!(result.compact_json, invalid);
}

#[test]
fn accepts_the_base64_padding_that_node_accepts() {
    for encoded in ["A=", "A==", "=="] {
        for input in [
            json!({"input": format!("data:image/png;base64,{encoded}")}),
            json!({"type": "file", "mediaType": "image/png", "data": encoded}),
        ] {
            let source = serde_json::to_vec(&input).unwrap();
            let result = extract_media(&source).unwrap();
            assert!(result.media.is_empty(), "zero-byte media: {input}");
            assert_eq!(result.compact_json, source);
        }
    }
    for (encoded, decoded) in [("aGk", b"hi".as_slice()), ("AAAA==", &[0, 0, 0])] {
        for input in [
            json!({"input": format!("data:image/png;base64,{encoded}")}),
            json!({"type": "file", "mediaType": "image/png", "data": encoded}),
        ] {
            let result = extract_media(&serde_json::to_vec(&input).unwrap()).unwrap();
            assert_eq!(result.media.len(), 1, "{input}");
            assert_eq!(result.media[0].decode().unwrap(), decoded);
        }
    }
}

#[test]
fn leaves_invalid_python_bytes_literals_inline_like_typescript() {
    for input in [
        br#"{"type":"file","mediaType":"image/png","data":"b'caf\u00e9'"}"#.as_slice(),
        br#"{"type":"file","mediaType":"image/png","data":"b'abc\\'"}"#,
        br#"{"type":"file","mediaType":"image/png","data":"b\"abc\\\""}"#,
    ] {
        let result = extract_media(input).expect("valid JSON");
        assert!(
            result.media.is_empty(),
            "invalid literal extracted: {}",
            String::from_utf8_lossy(input)
        );
        assert_eq!(result.compact_json, input);
    }
}

#[test]
fn leaves_invalid_and_unsupported_candidates_inline() {
    let input = br#"{"valid":"data:image/png;base64,aGk=","invalid":"data:image/png;base64,not#base64","invalid_padding":"data:image/png;base64,AAAA===","unsupported":"data/application/x-unknown;base64,aGk=","provider":{"type":"base64","media_type":"image/png","data":"AAAA==="}}"#;
    let result = extract_media(input).expect("valid JSON");
    assert_eq!(result.media.len(), 1);
    let compact = String::from_utf8(result.compact_json).unwrap();
    assert!(compact.contains("not#base64"));
    assert!(compact.contains("AAAA==="));
    assert!(compact.contains("application/x-unknown"));
}

#[test]
fn never_rewrites_media_like_object_keys() {
    let uri = data_uri(b"object-key");
    let input = format!(r#"{{"{uri}":"ordinary value"}}"#);
    let result = extract_media(input.as_bytes()).expect("valid JSON");
    assert!(result.media.is_empty());
    assert_eq!(result.compact_json, input.as_bytes());
}

#[test]
fn extracts_user_payload_values_named_name_or_key() {
    let name_uri = data_uri(b"payload-name");
    let key_uri = data_uri(b"payload-key");
    let input = serde_json::json!({
        "type": 1,
        "name": name_uri,
        "payload": { "type": "file", "mediaType": 42, "key": key_uri },
        "scope": { "name": data_uri(b"nested-name") },
    });
    let source = serde_json::to_vec(&input).expect("serialize payload");
    let result = extract_media(&source).expect("valid JSON");
    let compact: Value = serde_json::from_slice(&result.compact_json).expect("compact JSON");

    assert_eq!(result.media.len(), 3);
    assert!(compact["name"]
        .as_str()
        .is_some_and(|value| value.starts_with(MEDIA_REFERENCE_PREFIX)));
    assert!(compact["payload"]["key"]
        .as_str()
        .is_some_and(|value| value.starts_with(MEDIA_REFERENCE_PREFIX)));
    assert!(compact["scope"]["name"]
        .as_str()
        .is_some_and(|value| value.starts_with(MEDIA_REFERENCE_PREFIX)));
}

#[test]
fn does_not_extract_structural_otlp_strings_or_attribute_keys() {
    let uri = data_uri(b"structural");
    let input = serde_json::json!({
        "resourceSpans": [{
            "scopeSpans": [{
                "scope": { "name": uri, "version": "1" },
                "spans": [{
                    "name": uri,
                    "traceId": uri,
                    "data": uri,
                    "attributes": [{
                        "key": uri,
                        "value": { "stringValue": uri }
                    }]
                }]
            }]
        }]
    });
    let source = serde_json::to_vec(&input).expect("serialize OTLP envelope");
    let result = extract_media(&source).expect("valid JSON");

    assert_eq!(result.media.len(), 1);
    let compact: Value = serde_json::from_slice(&result.compact_json).expect("compact JSON");
    assert_eq!(
        compact["resourceSpans"][0]["scopeSpans"][0]["scope"]["name"],
        uri
    );
    assert_eq!(
        compact["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["name"],
        uri
    );
    assert_eq!(
        compact["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["traceId"],
        uri
    );
    assert_eq!(
        compact["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["data"],
        uri
    );
    assert_eq!(
        compact["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"][0]["key"],
        uri
    );
    assert!(
        compact["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"][0]["value"]
            ["stringValue"]
            .as_str()
            .is_some_and(|value| value.starts_with(MEDIA_REFERENCE_PREFIX))
    );
}

#[test]
fn recognizes_a_top_level_resource_span_array_as_an_otlp_envelope() {
    let uri = data_uri(b"array-envelope");
    let input = serde_json::json!([{
        "scopeSpans": [{
            "scope": { "name": uri },
            "spans": [{
                "name": uri,
                "attributes": [{
                    "key": uri,
                    "value": { "stringValue": uri }
                }]
            }]
        }]
    }]);
    let source = serde_json::to_vec(&input).expect("serialize OTLP envelope");
    let result = extract_media(&source).expect("valid JSON");
    let compact: Value = serde_json::from_slice(&result.compact_json).expect("compact JSON");

    assert_eq!(result.media.len(), 1);
    assert_eq!(compact[0]["scopeSpans"][0]["scope"]["name"], uri);
    assert_eq!(compact[0]["scopeSpans"][0]["spans"][0]["name"], uri);
    assert_eq!(
        compact[0]["scopeSpans"][0]["spans"][0]["attributes"][0]["key"],
        uri
    );
    assert!(
        compact[0]["scopeSpans"][0]["spans"][0]["attributes"][0]["value"]["stringValue"]
            .as_str()
            .is_some_and(|value| value.starts_with(MEDIA_REFERENCE_PREFIX))
    );
}

#[test]
fn rejects_bad_escaping_and_unsupported_surrogates() {
    assert!(matches!(
        extract_media(br#"{"x":"\q"}"#),
        Err(EarlyMediaError::InvalidJson { .. })
    ));
    assert!(matches!(
        extract_media(br#"{"x":"\ud800"}"#),
        Err(EarlyMediaError::UnsupportedUnicodeSurrogate { .. })
    ));
}

#[test]
fn distinguishes_valid_surrogate_pairs_from_unsupported_or_invalid_escapes() {
    let valid_pair = br#"{"value":"\ud83d\ude80"}"#;
    assert_eq!(
        extract_media(valid_pair)
            .expect("valid surrogate pair")
            .compact_json,
        valid_pair
    );

    let unpaired_low = r#"{"prefix":"é","value":"\udc00"}"#;
    let error = extract_media(unpaired_low.as_bytes()).expect_err("lone surrogate falls back");
    assert!(matches!(
        error,
        EarlyMediaError::UnsupportedUnicodeSurrogate { .. }
    ));

    assert!(matches!(
        extract_media(br#"{"value":"\ud800\u0061"}"#),
        Err(EarlyMediaError::UnsupportedUnicodeSurrogate { .. })
    ));
    assert!(matches!(
        extract_media(br#"{"value":"\ud800\uZZZZ"}"#),
        Err(EarlyMediaError::InvalidJson { .. })
    ));

    // An escaped backslash leaves the following `uD800` as ordinary text. The
    // same suffix after three backslashes contains a real, unsupported escape.
    assert!(matches!(
        extract_media(r#""\\ud800"#.as_bytes()),
        Err(EarlyMediaError::InvalidJson { .. })
    ));
    assert!(matches!(
        extract_media(r#""\\\ud800"#.as_bytes()),
        Err(EarlyMediaError::UnsupportedUnicodeSurrogate { .. })
    ));
}

#[test]
fn rejects_raw_controls_at_any_position_in_a_string() {
    for control in 0u8..=0x1f {
        for prefix_len in [0, 1, 127, 1023, 1024, 4095] {
            let mut input = br#"{"value":""#.to_vec();
            input.extend(std::iter::repeat_n(b'x', prefix_len));
            input.push(control);
            input.extend_from_slice("tail🔥\\\"".as_bytes());
            input.extend_from_slice(br#""}"#);

            assert!(matches!(
                validate_and_discover(input),
                Err(EarlyMediaError::InvalidJson {
                    message: "control byte in string",
                    ..
                })
            ));
        }
    }
}

#[test]
fn malformed_envelope_takes_precedence_over_nested_media_ambiguity() {
    let encoded = BASE64.encode(b"abc");
    let embedded = format!(
        r#"[{{"type":"file","mediaType":"image/png","data":"{encoded}"}},{{"type":"file","mediaType":"image/png","data":"b'abc'"}}]"#
    );
    let envelope = json!({
        "resourceSpans": [{
            "scopeSpans": [{
                "spans": [{
                    "attributes": [{
                        "key": "input",
                        "value": {"stringValue": embedded},
                    }],
                }],
            }],
        }],
    });
    let mut input = serde_json::to_string(&envelope).unwrap();
    input.pop();
    input.push_str(r#", "malformed":}"#);

    assert!(matches!(
        extract_media(input.as_bytes()),
        Err(EarlyMediaError::InvalidJson { .. })
    ));
}

#[test]
fn allows_exact_duplicate_representations() {
    let input = br#"[{"type":"file","mediaType":"image/png","data":"b'abc'"},{"type":"file","mediaType":"image/png","data":"b'abc'"}]"#;
    let result = extract_media(input).expect("identical representations are unambiguous");
    assert_eq!(result.media.len(), 2);
    assert_eq!(result.media[0].reference, result.media[1].reference);
    assert_eq!(result.media[0].original_value().unwrap(), "b'abc'");
    assert_eq!(result.media[1].original_value().unwrap(), "b'abc'");
}

#[test]
fn rejects_same_content_with_different_source_representations() {
    let encoded = BASE64.encode(b"abc");
    let input = format!(
        r#"[{{"type":"file","mediaType":"image/png","data":"{encoded}"}},{{"type":"file","mediaType":"image/png","data":"b'abc'"}}]"#
    );
    assert!(matches!(
        validate_and_discover(input.into_bytes()),
        Err(EarlyMediaError::UnsupportedMediaReferenceAmbiguity { .. })
    ));
}

#[test]
fn rejects_extracted_media_that_collides_with_a_preexisting_reference() {
    let uri = data_uri(b"collision");
    let (reference, _) = media_identity_from_encoded(
        uri.as_bytes(),
        "image/png",
        MediaSource::Base64DataUri,
        MediaEncoding::Base64DataUri,
    )
    .expect("valid data URI reference");
    let input = format!(r#"{{"input":"{uri}","existing":"{reference}"}}"#);
    assert!(matches!(
        validate_and_discover(input.clone().into_bytes()),
        Err(EarlyMediaError::UnsupportedMediaReferenceAmbiguity { .. })
    ));

    let encoded = BASE64.encode(b"hi");
    let (structured_reference, _) = media_identity_from_encoded(
        encoded.as_bytes(),
        "image/png",
        MediaSource::Bytes,
        MediaEncoding::Base64,
    )
    .expect("valid structured media reference");
    let provider_input = format!(
        r#"{{"type":"base64","media_type":"image/png","data":"{encoded}","other":"{structured_reference}"}}"#
    );
    let gemini_input = format!(
        r#"{{"inline_data":{{"mime_type":"image/png","data":"{encoded}","other":"{structured_reference}"}}}}"#
    );
    for input in [provider_input, gemini_input] {
        assert!(matches!(
            validate_and_discover(input.clone().into_bytes()),
            Err(EarlyMediaError::UnsupportedMediaReferenceAmbiguity { .. })
        ));
    }
}

#[test]
fn rejects_media_that_collides_with_a_unicode_escaped_nested_reference() {
    let uri = data_uri(b"nested-collision");
    let (reference, _) = media_identity_from_encoded(
        uri.as_bytes(),
        "image/png",
        MediaSource::Base64DataUri,
        MediaEncoding::Base64DataUri,
    )
    .expect("valid data URI reference");
    let nested = format!(r#"{{"existing":"\u0040{}"}}"#, &reference[1..]);
    let encoded_nested = serde_json::to_string(&nested).expect("serialize nested JSON");
    let input = format!(r#"{{"input":"{uri}","nested":{encoded_nested}}}"#);

    assert!(matches!(
        validate_and_discover(input.clone().into_bytes()),
        Err(EarlyMediaError::UnsupportedMediaReferenceAmbiguity { .. })
    ));
}

proptest! {
    #[test]
    fn media_prefilter_matches_substring_contract(
        prefix in json_string_strategy(),
        marker in prop::option::of(prop::sample::select(vec![
            "data:", "@@@langfuseMedia:", "\\u", "media_type", "mime_type",
            "mediaType", "mimeType", "inline_data", "inlineData",
        ])),
        suffix in json_string_strategy(),
    ) {
        let value = format!("{prefix}{}{suffix}", marker.unwrap_or(""));
        let candidate = [
            "data:", "@@@langfuseMedia:", "\\u", "media_type", "mime_type",
            "mediaType", "mimeType", "inline_data", "inlineData",
        ].iter().any(|marker| value.contains(marker));
        prop_assert_eq!(may_contain_media_candidate(&value), candidate);
    }

    #[test]
    fn valid_json_with_a_trailing_token_is_rejected(
        value in json_value_strategy(6),
    ) {
        let mut source = serde_json::to_vec(&value).expect("serialize generated JSON");
        source.push(b'x');
        let rejected = matches!(
            extract_media(&source),
            Err(EarlyMediaError::TrailingBytes { .. })
                | Err(EarlyMediaError::InvalidJson { .. })
        );
        prop_assert!(rejected);
    }
}
