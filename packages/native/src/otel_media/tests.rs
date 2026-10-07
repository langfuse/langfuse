use super::encoding::BASE64;
use super::payload::{EarlyMediaError, MediaEncoding, MediaPayloadKind, MediaSource};
use super::rules::{may_contain_media_candidate, MEDIA_REFERENCE_PREFIX};
use super::scanner::{discover_measured, media_identity_from_encoded};
use super::{extract_media, validate};
use base64::Engine;
use proptest::prelude::*;
use serde_json::{json, Value};

fn validate_measured(
    input: Vec<u8>,
) -> Result<(super::ValidatedPayload, usize, usize, usize, usize), EarlyMediaError> {
    let validated = validate(input.clone())?;
    let (manifest, visited, index_bytes, unique) = discover_measured(&input)?;
    let retained_bytes = validated.retained_bytes() + manifest.retained_bytes();
    Ok((validated, visited, index_bytes, unique, retained_bytes))
}

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
    assert_eq!(entry["value"]["stringValue"], result.media[0].reference());
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
fn validates_and_extracts_beyond_the_former_parser_depth_limit() {
    let uri = data_uri(b"deep");
    for depth in [128, 512, 4096] {
        let array = format!("{}\"{uri}\"{}", "[".repeat(depth), "]".repeat(depth));
        let object = format!("{}\"{uri}\"{}", "{\"x\":".repeat(depth), "}".repeat(depth));
        for input in [array, object] {
            let (validated, _, index_bytes, _, _) =
                validate_measured(input.as_bytes().to_vec()).expect("deep JSON remains native");
            // Arrays do not need object-only maps or provider state.
            assert!(
                index_bytes <= 24 * input.len(),
                "{index_bytes} bytes for {} input bytes",
                input.len()
            );
            let result = validated.compact().unwrap();
            assert_eq!(result.media.len(), 1);
            assert_eq!(result.media[0].decode().unwrap(), b"deep");
        }
    }
}

#[test]
fn deep_structural_scan_keeps_provider_objects_inline_but_finds_uri_text() {
    let uri = data_uri(b"deep-uri");
    let mut embedded = format!(
        r#"{{"provider":{{"type":"base64","media_type":"image/png","data":"aGk="}},"uri":"{uri}"}}"#
    );
    for _ in 0..300 {
        embedded = format!(r#"{{"nested":{embedded}}}"#);
    }
    let input = format!(
        r#"{{"text":{}}}"#,
        serde_json::to_string(&embedded).unwrap()
    );
    let (_, _, index_bytes, _, _) = validate_measured(input.as_bytes().to_vec()).unwrap();
    assert!(
        index_bytes <= 256 * 1024,
        "embedded walk retained {index_bytes} bytes"
    );

    let result = extract_media(input.as_bytes()).expect("deep JSON remains valid");
    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].decode().unwrap(), b"deep-uri");
    let compact: Value = serde_json::from_slice(&result.compact_json).unwrap();
    let compact_embedded = compact["text"].as_str().unwrap();
    assert!(compact_embedded.contains(r#""type":"base64""#));
    assert!(compact_embedded.contains(r#""data":"aGk=""#));
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
fn limits_embedded_documents_without_losing_uri_text_or_siblings() {
    let provider_data = BASE64.encode(b"provider");
    let deep_uri = data_uri(b"at-limit");
    let quoted_uri = data_uri(b"quoted");
    let sibling_uri = data_uri(b"sibling");
    for layers in [2, 3, 10] {
        let mut document = format!(
            r#"{{"provider":{{"type":"base64","media_type":"image/png","data":"{provider_data}"}},"text":"{deep_uri} after","quoted":"{quoted_uri}"}}"#
        );
        for _ in 0..layers {
            let encoded = serde_json::to_string(&document).unwrap();
            document = format!(r#"{{"embedded":{encoded}}}"#);
        }
        let input = format!(r#"{{"deep":{document},"sibling":"{sibling_uri}","tail":"after"}}"#);
        let result = extract_media(input.as_bytes()).expect("valid embedded documents");
        let bodies = result
            .media
            .iter()
            .map(|media| media.decode().unwrap())
            .collect::<Vec<_>>();
        let expected_bodies = if layers == 2 {
            vec![
                b"provider".to_vec(),
                b"at-limit".to_vec(),
                b"quoted".to_vec(),
                b"sibling".to_vec(),
            ]
        } else if layers == 3 {
            vec![
                b"at-limit".to_vec(),
                b"quoted".to_vec(),
                b"sibling".to_vec(),
            ]
        } else {
            // Further quoting leaves a backslash after the payload, which is not
            // a valid URI terminator for text-only scanning.
            vec![b"at-limit".to_vec(), b"sibling".to_vec()]
        };
        assert_eq!(bodies, expected_bodies, "embedded layers: {layers}");
        let mut expected = input;
        for media in &result.media {
            expected = expected.replacen(&media.original_value().unwrap(), &media.reference(), 1);
        }
        assert_eq!(String::from_utf8(result.compact_json).unwrap(), expected);
    }
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
fn data_uri_provider_fields_use_the_uri_metadata() {
    for input in [
        r#"{"type":"file","mediaType":"image/jpeg","data":"data:image/png;base64,aGk="}"#,
        r#"{"type":"base64","media_type":"image/jpeg","data":"data:image/png;base64,aGk="}"#,
    ] {
        let result = extract_media(input.as_bytes()).expect("valid provider Data URI");

        assert_eq!(result.media.len(), 1);
        let media = &result.media[0];
        assert_eq!(media.kind, MediaPayloadKind::DataUri);
        assert_eq!(media.metadata.content_type, "image/png");
        assert_eq!(media.metadata.source, MediaSource::Base64DataUri);
        assert_eq!(media.decode().unwrap(), b"hi");
    }
}

#[test]
fn nested_provider_original_value_preserves_inner_json_escapes() {
    let cases = [
        (
            r#"{"type":"file","mediaType":"image/png","data":"data:image/png;base64,\u0061Gk="}"#,
            r#"data:image/png;base64,\u0061Gk="#,
            "data:image/png;base64,aGk=",
            b"hi".as_slice(),
        ),
        (
            r#"{"type":"file","mediaType":"image/png","data":"data:image/png;base64,\/\/\/\/"}"#,
            r#"data:image/png;base64,\/\/\/\/"#,
            "data:image/png;base64,////",
            &[0xff, 0xff, 0xff][..],
        ),
        (
            r#"{"type":"file","mediaType":"text/plain","data":"b'\u0022'"}"#,
            r#"b'\u0022'"#,
            "b'\"'",
            b"\"".as_slice(),
        ),
    ];

    for (nested, expected_original, expected_decoded, expected_body) in cases {
        let encoded_nested = serde_json::to_string(nested).expect("serialize nested JSON");
        let input = format!(r#"{{"text":{encoded_nested}}}"#);
        let result = extract_media(input.as_bytes()).expect("valid nested provider JSON");

        assert_eq!(result.media.len(), 1, "nested source: {nested}");
        assert_eq!(result.media[0].original_json_depth(), 1);
        assert_eq!(
            result.media[0].original_value().unwrap(),
            expected_original,
            "nested source: {nested}"
        );
        assert_eq!(
            result.media[0].original_value_for_layers(Some(0)).unwrap(),
            expected_decoded
        );
        assert_eq!(result.media[0].decode().unwrap(), expected_body);
    }
}

#[test]
fn nested_provider_source_spelling_survives_two_stringified_layers() {
    let provider = r#"{"type":"file","mediaType":"text/plain","data":"b'\u0022'"}"#;
    let encoded_provider = serde_json::to_string(provider)
        .expect("serialize provider")
        .replace("\\\"", "\\u0022");
    let first_layer = format!(r#"{{"child":{}}}"#, encoded_provider);
    let input = format!(
        r#"{{"text":{}}}"#,
        serde_json::to_string(&first_layer).expect("serialize first layer")
    );
    let result = extract_media(input.as_bytes()).expect("valid nested provider JSON");
    assert_eq!(result.media.len(), 1);

    let media = &result.media[0];
    assert_eq!(media.original_json_depth(), 2);
    assert_eq!(media.original_value().unwrap(), r#"b'\\u0022'"#);
    assert_eq!(
        media.original_value_for_layers(Some(2)).unwrap(),
        r#"b'\\u0022'"#
    );
    assert_eq!(
        media.original_value_for_layers(Some(1)).unwrap(),
        r#"b'\u0022'"#
    );
    assert_eq!(media.original_value_for_layers(Some(0)).unwrap(), "b'\"'");
    assert!(matches!(
        media.original_value_for_layers(Some(17)),
        Err(super::payload::MediaDecodeError::JsonLayerLimit)
    ));

    let compact: Value = serde_json::from_slice(&result.compact_json).unwrap();
    let compact_first_layer = compact["text"].as_str().unwrap();
    let reference = media.reference();
    assert_eq!(
        compact_first_layer.replace(&reference, &media.original_value().unwrap()),
        first_layer
    );
}

#[test]
fn continues_to_the_next_gemini_shape_when_one_is_not_decodable() {
    let input = br#"{"inline_data":{"mime_type":1,"data":"aGk="},"inlineData":{"mimeType":"image/png","data":"aGk="}}"#;
    let result = extract_media(input).expect("valid Gemini alternatives");

    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].kind, MediaPayloadKind::Gemini);
    assert_eq!(result.media[0].decode().unwrap(), b"hi");
}

#[test]
fn keeps_embedded_provider_documents_in_payload_mode() {
    let encoded = BASE64.encode(b"embedded-provider");
    let nested = format!(
        r#"{{"scopeSpans":"provider field","type":"file","mediaType":"image/png","data":"{encoded}"}}"#
    );
    let encoded_nested = serde_json::to_string(&nested).expect("serialize nested JSON");
    let input = format!(r#"{{"text":{encoded_nested}}}"#);

    let result = extract_media(input.as_bytes()).expect("valid embedded provider JSON");

    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].decode().unwrap(), b"embedded-provider");
}

#[test]
fn classifies_each_root_array_object_before_discovery() {
    let provider_data = BASE64.encode(b"provider-first");
    let envelope_uri = data_uri(b"envelope-second");
    let structural_uri = data_uri(b"structural-name");
    let input = format!(
        r#"[{{"type":"file","mediaType":"image/png","data":"{provider_data}"}},{{"scopeSpans":[{{"scope":{{"name":"{structural_uri}"}},"spans":[{{"attributes":[{{"key":"{structural_uri}","value":{{"stringValue":"{envelope_uri}"}}}}]}}]}}]}}]"#
    );

    let result = extract_media(input.as_bytes()).expect("valid mixed root array");

    assert_eq!(result.media.len(), 2);
    assert_eq!(result.media[0].decode().unwrap(), b"provider-first");
    assert_eq!(result.media[1].decode().unwrap(), b"envelope-second");
    let compact: Value = serde_json::from_slice(&result.compact_json).unwrap();
    assert_eq!(compact[1]["scopeSpans"][0]["scope"]["name"], structural_uri);
    assert_eq!(
        compact[1]["scopeSpans"][0]["spans"][0]["attributes"][0]["key"],
        structural_uri
    );
}

#[test]
fn media_prefilter_is_conservative_for_structured_and_escaped_candidates() {
    // Buffer-like fields are not media candidates and should stay on the
    // validation-only path.
    assert!(!may_contain_media_candidate(
        r#"{"traceId":{"type":"Buffer","data":[1,2,3]}}"#
    ));
    assert!(may_contain_media_candidate(
        r#"{"type":"media","mime_type":"image/png","data":"aGk="}"#
    ));
    // Escaped provider JSON still contains a literal MIME marker.
    assert!(may_contain_media_candidate(
        r#"{"text":"{\"type\":\"base64\",\"media_type\":\"image/png\",\"data\":\"aGk=\"}"}"#
    ));
    // Unicode-escaped markers must not be optimized away.
    assert!(may_contain_media_candidate(
        r#"{"text":"\u0064ata:image/png;base64,aGk="}"#
    ));
}

#[test]
fn validation_only_path_preserves_valid_json_and_rejects_trailing_bytes() {
    let input = br#"{"traceId":{"type":"Buffer","data":[1,2,3]},"text":"plain"}"#;
    let validated = validate(input.to_vec()).expect("valid JSON");
    assert_eq!(validated.into_source(), input);

    let mut invalid = input.to_vec();
    invalid.push(b'x');
    assert!(matches!(
        validate(invalid),
        Err(EarlyMediaError::TrailingBytes { .. })
    ));
}

#[test]
fn validation_preserves_inline_media_until_compaction() {
    let uri = data_uri(b"validation-only");
    let input = format!(r#"{{"input":"{uri}"}}"#);
    let validated = validate(input.as_bytes().to_vec()).expect("valid JSON");
    assert_eq!(validated.into_source(), input.as_bytes());

    let result = validate(input.into_bytes()).unwrap().compact().unwrap();
    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].decode().unwrap(), b"validation-only");
}

#[test]
fn extracts_repeated_small_nested_objects_without_a_resource_fallback() {
    let uri = data_uri(b"deep");
    let chain = (0..120).fold(format!("\"{uri}\""), |value, _| {
        format!(r#"{{"x":{value}}}"#)
    });
    let input = format!(
        "[{}]",
        std::iter::repeat_n(chain, 32).collect::<Vec<_>>().join(",")
    );
    let (validated, scanned, index_bytes, _, _) =
        validate_measured(input.as_bytes().to_vec()).expect("valid nested input stays native");
    // Bound source revisits instead of relying on a wall-clock threshold.
    assert!(
        scanned <= 3 * input.len(),
        "scanned {scanned} for {} source bytes",
        input.len()
    );
    // Discovery state should scale with structure, not repeated siblings.
    assert!(index_bytes <= 16 * input.len());
    let result = validated.compact().unwrap();
    assert_eq!(result.media.len(), 32);
    assert!(result
        .media
        .iter()
        .all(|media| media.decode().unwrap() == b"deep"));
}

#[test]
fn indexed_subtrees_survive_mixed_siblings_and_provider_lookahead() {
    let uri = data_uri(b"deep");
    let chain = (0..118).fold(format!("\"{uri}\""), |value, level| {
        if level % 2 == 0 {
            format!(r#"{{"x":{value}}}"#)
        } else {
            format!("[{value}]")
        }
    });
    let provider = r#"{"inline_data":{"mime_type":"image/png","data":"aGk=","other":[{"x":[0]}]},"siblings":[{},[{"x":[]}]]}"#;
    let payload = format!(r#"{{"first":[{chain},{provider}],"second":[{provider},{chain}]}}"#);
    let envelope = format!(
        r#"{{"resourceSpans":[{{"attributes":[{{"key":"input","value":{{"stringValue":{}}}}}]}}],"scopeSpans":[]}}"#,
        serde_json::to_string(&payload).unwrap()
    );
    let embedded = serde_json::to_string(&payload).unwrap();
    for (input, repetitions) in [
        (payload.clone(), 1),
        (embedded.clone(), 1),
        (envelope.clone(), 1),
        (format!("[{envelope},{payload}]"), 2),
        (format!("[{payload},{envelope}]"), 2),
        (format!(r#"{{"one":{embedded},"two":{embedded}}}"#), 2),
    ] {
        let (validated, scanned, index_bytes, _, _) =
            validate_measured(input.as_bytes().to_vec()).unwrap();
        assert!(
            scanned <= 6 * input.len(),
            "scanned {scanned} for {} source bytes",
            input.len()
        );
        assert!(index_bytes <= 16 * input.len());
        let result = validated.compact().unwrap();
        let bodies = result
            .media
            .iter()
            .map(|media| media.decode().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            bodies,
            [b"deep".as_slice(), b"hi", b"hi", b"deep"].repeat(repetitions)
        );
    }
}

#[test]
fn preserves_large_existing_media_references_without_a_resource_fallback() {
    let reference = format!(
        "@@@langfuseMedia:type=image/png|id={}@@@",
        "x".repeat(8 * 1024)
    );
    let references = (0..16_385)
        .map(|index| format!("@@@langfuseMedia:type=image/png|id={index}@@@"))
        .collect::<Vec<_>>();
    for text in [reference, references.join(" ")] {
        let input = format!(r#"{{"existing":"{text}"}}"#);
        let (validated, scanned, _, _, retained_bytes) =
            validate_measured(input.as_bytes().to_vec()).unwrap();
        assert!(scanned <= 3 * input.len());
        assert!(retained_bytes <= 3 * input.len());
        let result = validated.compact().unwrap();
        assert_eq!(result.compact_json, input.as_bytes());
    }
}

#[test]
fn extracts_many_tiny_candidates_without_a_resource_fallback() {
    let uri = data_uri(b"candidate");
    let values = std::iter::repeat_n(uri.as_str(), 16 * 1024 + 1).collect::<Vec<_>>();
    let input = format!(r#"{{"text":"{}"}}"#, values.join(" "));
    let (validated, scanned, _, unique, retained_bytes) =
        validate_measured(input.as_bytes().to_vec()).expect("many candidates stay native");
    assert_eq!(
        unique, 1,
        "identical occurrences share one content descriptor"
    );
    assert!(scanned <= 3 * input.len());
    assert!(
        retained_bytes <= 4 * input.len(),
        "retained {} for {} source bytes",
        retained_bytes,
        input.len()
    );
    let result = validated.compact().unwrap();
    assert_eq!(result.media.len(), values.len());
    assert!(result
        .media
        .iter()
        .all(|media| media.decode().unwrap() == b"candidate"));
}

#[test]
fn unique_and_escaped_candidates_have_input_proportional_retention() {
    let uris = (0..16_385u32)
        .map(|value| data_uri(&value.to_le_bytes()))
        .collect::<Vec<_>>();
    for escaped in [false, true] {
        let values = uris
            .iter()
            .map(|uri| {
                if escaped {
                    format!(
                        "\"{}\"",
                        uri.chars()
                            .map(|character| format!("\\u{:04x}", character as u32))
                            .collect::<String>()
                    )
                } else {
                    serde_json::to_string(uri).unwrap()
                }
            })
            .collect::<Vec<_>>()
            .join(",");
        let input = format!("[{values}]");
        let (validated, scanned, _, unique, retained_bytes) =
            validate_measured(input.as_bytes().to_vec()).unwrap();
        assert_eq!(unique, uris.len());
        assert!(scanned <= 3 * input.len());
        // Escaped bodies may own decoded text, but must not retain a whole
        // decoded document per entry.
        assert!(retained_bytes <= 8 * input.len());
        let result = validated.compact().unwrap();
        for (index, media) in result.media.iter().enumerate() {
            assert_eq!(media.decode().unwrap(), (index as u32).to_le_bytes());
            assert_eq!(media.original_value().unwrap(), uris[index]);
        }
    }
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
fn leaves_lone_surrogate_strings_inline_and_extracts_siblings() {
    let uri = data_uri(b"sibling");
    for text in [r"\ud800", r"\udc00", r"\ud800\u0061"] {
        let input = format!(r#"{{"note":"{text}","image":"{uri}"}}"#);
        let result = extract_media(input.as_bytes()).expect("raw surrogate escape is valid JSON");
        assert_eq!(result.media.len(), 1);
        assert_eq!(result.media[0].decode().unwrap(), b"sibling");
        assert!(String::from_utf8(result.compact_json)
            .unwrap()
            .contains(text));
    }
    let input = br#"{"value":"\ud83d\ude80"}"#;
    assert_eq!(extract_media(input).unwrap().compact_json, input);
    for input in [br#"{"x":"\q"}"#.as_slice(), br#"{"x":"\ud800\uZZZZ"}"#] {
        assert!(matches!(
            extract_media(input),
            Err(EarlyMediaError::InvalidJson { .. })
        ));
    }
}

#[test]
fn malformed_utf8_is_replaced_before_discovery() {
    let mut input = b"{\"note\":\"".to_vec();
    input.extend([0xff, 0xe2, 0x82]);
    input.extend_from_slice(b"\",\"image\":\"data:image/png;base64,YWJj\"}");
    let result = extract_media(&input).unwrap();
    let compact: Value = serde_json::from_slice(&result.compact_json).unwrap();
    assert_eq!(compact["note"], "��");
    assert_eq!(result.media[0].decode().unwrap(), b"abc");
    assert_eq!(
        result.media[0].original_value().unwrap(),
        "data:image/png;base64,YWJj"
    );
}

#[test]
fn embedded_json_keeps_surrogate_strings_and_extracts_sibling_fields() {
    let nested = r#"{"note":"\ud800","image":"data:image/png;base64,aGk="}"#;
    let input = serde_json::to_string(nested).unwrap();
    let result = extract_media(input.as_bytes()).expect("embedded surrogate remains inline");
    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].decode().unwrap(), b"hi");
    let expected = input.replace("data:image/png;base64,aGk=", &result.media[0].reference());
    assert_eq!(String::from_utf8(result.compact_json).unwrap(), expected);
}

#[test]
fn undecodable_keys_leave_their_values_inline_including_shadowed_values() {
    // Undecodable keys cannot participate in last-key-wins resolution. Preserve
    // their values while still extracting ordinary siblings.
    let object = r#"{"\ud800":"data:image/png;base64,YQ==","\uD800":"data:image/png;base64,Yg==","ok":"data:image/png;base64,Yw=="}"#;
    for input in [object.to_owned(), serde_json::to_string(object).unwrap()] {
        let result = extract_media(input.as_bytes()).unwrap();
        assert_eq!(result.media.len(), 1);
        assert_eq!(result.media[0].decode().unwrap(), b"c");
        let restored = String::from_utf8(result.compact_json).unwrap().replace(
            &result.media[0].reference(),
            &result.media[0].original_value().unwrap(),
        );
        assert_eq!(restored, input);
    }
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
                validate(input),
                Err(EarlyMediaError::InvalidJson { .. })
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
fn duplicate_occurrences_have_distinct_references_and_shared_content_identity() {
    let input = br#"[{"type":"file","mediaType":"image/png","data":"b'abc'"},{"type":"file","mediaType":"image/png","data":"b'abc'"}]"#;
    let result = extract_media(input).expect("duplicate representations");
    assert_eq!(result.media.len(), 2);
    assert_ne!(result.media[0].reference(), result.media[1].reference());
    assert_eq!(
        result.media[0].metadata.sha256_hash,
        result.media[1].metadata.sha256_hash
    );
    assert_eq!(result.media[0].original_value().unwrap(), "b'abc'");
    assert_eq!(result.media[1].original_value().unwrap(), "b'abc'");
}

#[test]
fn same_content_with_different_spellings_keeps_each_original() {
    let encoded = BASE64.encode(b"abc");
    let input = format!(
        r#"[{{"type":"file","mediaType":"image/png","data":"{encoded}"}},{{"type":"file","mediaType":"image/png","data":"b'abc'"}}]"#
    );
    let result = extract_media(input.as_bytes()).unwrap();
    assert_eq!(result.media.len(), 2);
    assert_ne!(result.media[0].reference(), result.media[1].reference());
    assert_eq!(
        result.media[0].metadata.sha256_hash,
        result.media[1].metadata.sha256_hash
    );
    assert_eq!(result.media[0].original_value().unwrap(), encoded);
    assert_eq!(result.media[1].original_value().unwrap(), "b'abc'");
}

#[test]
fn existing_public_references_are_preserved_beside_new_occurrences() {
    let uri = data_uri(b"collision");
    let (reference, _) = media_identity_from_encoded(
        uri.as_bytes(),
        "image/png",
        MediaSource::Base64DataUri,
        MediaEncoding::Base64DataUri,
    )
    .unwrap();
    let encoded = BASE64.encode(b"hi");
    let (structured_reference, _) = media_identity_from_encoded(
        encoded.as_bytes(),
        "image/png",
        MediaSource::Bytes,
        MediaEncoding::Base64,
    )
    .unwrap();
    let nested = format!(r#"{{"existing":"\u0040{}"}}"#, &reference[1..]);
    let encoded_nested = serde_json::to_string(&nested).unwrap();
    for (input, expected_reference) in [
        (
            format!(r#"{{"input":"{uri}","existing":"{reference}"}}"#),
            reference.clone(),
        ),
        (
            format!(
                r#"{{"type":"base64","media_type":"image/png","data":"{encoded}","other":"{structured_reference}"}}"#
            ),
            structured_reference.clone(),
        ),
        (
            format!(
                r#"{{"inline_data":{{"mime_type":"image/png","data":"{encoded}","other":"{structured_reference}"}}}}"#
            ),
            structured_reference,
        ),
        (
            format!(r#"{{"input":"{uri}","nested":{encoded_nested}}}"#),
            reference,
        ),
    ] {
        let result = extract_media(input.as_bytes()).unwrap();
        assert_eq!(result.media.len(), 1);
        let pending = result.media[0].reference();
        assert_ne!(pending, expected_reference);
        let restored = String::from_utf8(result.compact_json)
            .unwrap()
            .replace(&pending, &result.media[0].original_value().unwrap());
        assert_eq!(restored, input);
    }
}

proptest! {
    #[test]
    fn structural_work_stays_proportional_across_depth_width_and_embedded_json(
        depth in 0usize..120,
        width in 1usize..32,
        embedded in any::<bool>(),
        object_root in any::<bool>(),
        body in prop::collection::vec(any::<u8>(), 1..24),
    ) {
        let uri = data_uri(&body);
        let chain = (0..depth).fold(format!("\"{uri}\""), |value, level| {
            if level % 2 == 0 { format!(r#"{{"x":{value}}}"#) } else { format!("[{value}]") }
        });
        let mut input = format!("[{}]", std::iter::repeat_n(chain, width).collect::<Vec<_>>().join(","));
        if object_root { input = format!(r#"{{"items":{input}}}"#); }
        if embedded { input = serde_json::to_string(&input).unwrap(); }
        let (validated, scanned, index_bytes, unique, _) =
            validate_measured(input.as_bytes().to_vec()).unwrap();
        // Embedded documents are validated separately, but each structural pass
        // remains linear in that document's source size.
        prop_assert!(scanned <= 6 * input.len(), "{} syntax bytes for {} input bytes", scanned, input.len());
        // The walk retains open frames and candidates, not closed containers.
        // Allow fixed initial capacities as well as depth and result growth.
        prop_assert!(index_bytes <= 4096 + 512 * (depth + 3 + width), "{} index bytes", index_bytes);
        prop_assert_eq!(unique, 1);
        let result = validated.compact().unwrap();
        prop_assert_eq!(result.media.len(), width);
        for media in result.media { let decoded = media.decode().unwrap();
            prop_assert_eq!(decoded.as_slice(), body.as_slice()); }
    }

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
