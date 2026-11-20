use super::encoding::BASE64;
use super::payload::{EarlyMediaError, MediaEncoding, MediaPayloadKind, MediaSource};
use super::rules::{may_contain_media_candidate, MEDIA_REFERENCE_PREFIX, MIN_EARLY_MEDIA_BYTES};
use super::scanner::{discover_measured, media_identity_from_encoded};
use super::{extract_media, validate};
use base64::Engine;
use proptest::prelude::*;
use serde_json::{json, Value};

fn validate_measured(
    input: Vec<u8>,
) -> Result<(super::ValidatedPayload, usize, usize, usize, usize), EarlyMediaError> {
    let validated = validate(input.clone())?;
    let (manifest, visited, index_bytes, unique) =
        discover_measured(std::str::from_utf8(&input).unwrap())?;
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

pub(super) fn large_data_uri(label: &[u8]) -> (String, Vec<u8>) {
    let mut payload = vec![b'x'; MIN_EARLY_MEDIA_BYTES];
    let copy_len = label.len().min(payload.len());
    payload[..copy_len].copy_from_slice(&label[..copy_len]);
    (data_uri(&payload), payload)
}

pub(super) fn large_base64(label: &[u8]) -> (String, Vec<u8>) {
    let mut payload = vec![b'x'; MIN_EARLY_MEDIA_BYTES];
    let copy_len = label.len().min(payload.len());
    payload[..copy_len].copy_from_slice(&label[..copy_len]);
    (BASE64.encode(&payload), payload)
}

#[test]
fn early_extraction_uses_encoded_size_for_uri_and_provider_candidates() {
    for size in [1023, 1024] {
        let header = "data:image/png;name=a;base64,";
        let uri = format!("{header}{}", "A".repeat(size - header.len()));
        let provider = "A".repeat(size);
        let input =
            format!(r#"["{uri}",{{"type":"file","mediaType":"image/png","data":"{provider}"}}]"#);
        let result = extract_media(input.as_bytes()).unwrap();
        assert_eq!(result.media.len(), if size < 1024 { 0 } else { 2 });
        if size < 1024 {
            assert_eq!(result.compact_json, input);
        }
    }
}

#[test]
fn validates_and_extracts_data_uri_without_parsing_a_value_tree() {
    let (uri, body) = large_data_uri(b"image");
    let input = format!(r#"{{"input":"before {uri} after"}}"#);
    let result = extract_media(input.as_bytes()).expect("valid JSON");

    assert_eq!(result.media.len(), 1);
    assert!(result
        .compact_json
        .contains("@@@langfuseMedia:type=image/png|id="));
    assert_eq!(result.media[0].decode().unwrap(), body);
    assert_eq!(result.media[0].original_value().unwrap(), uri);
    assert_eq!(result.media[0].kind, MediaPayloadKind::DataUri);
}

#[test]
fn tag_attribute_values_stay_inline_only_on_spans() {
    let (uri, _) = large_data_uri(b"tag");
    let value = format!(r#""value":{{"stringValue":"{uri}"}}"#);
    for key in [
        "langfuse.trace.tags",
        "langfuse.tags",
        "langfuse.observation.metadata.langfuse_tags",
        "langfuse.trace.metadata.langfuse_tags",
        "ai.telemetry.metadata.tags",
        "tag.tags",
    ] {
        let tag_key = format!(r#""key":"{key}""#);
        for (fields, is_tag) in [
            (format!("{tag_key},{value}"), true),
            (format!("{value},{tag_key}"), true),
            (format!(r#""key":"input",{value},{tag_key}"#), true),
            (format!(r#"{tag_key},{value},"key":"input""#), false),
            (format!(r#"{tag_key},{value},"key":null"#), false),
        ] {
            let attribute = format!("{{{fields}}}");
            let input = format!(
                r#"[{{
                "resource":{{"attributes":[{attribute}]}},
                "scopeSpans":[{{
                    "scope":{{"attributes":[{attribute}]}},
                    "spans":[{{"attributes":[{attribute},
                        {{"key":"input","value":{{"kvlistValue":{{"values":[{attribute}]}}}}}}
                    ]}}]
                }}]
            }},{attribute}]"#
            );
            let result = extract_media(input.as_bytes()).unwrap();
            assert_eq!(result.media.len(), if is_tag { 4 } else { 5 }, "{key}");
            let compact: Value = serde_json::from_str(&result.compact_json).unwrap();
            let value =
                &compact[0]["scopeSpans"][0]["spans"][0]["attributes"][0]["value"]["stringValue"];
            assert_eq!(value == &uri, is_tag);
        }
    }
}

#[test]
fn validates_and_extracts_beyond_the_former_parser_depth_limit() {
    let (uri, body) = large_data_uri(b"deep");
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
            assert_eq!(result.media[0].decode().unwrap(), body);
        }
    }
}

#[test]
fn deep_structural_scan_keeps_provider_objects_inline_but_finds_uri_text() {
    let (uri, body) = large_data_uri(b"deep-uri");
    let (provider_data, _) = large_base64(b"deep-provider");
    let mut embedded = format!(
        r#"{{"provider":{{"type":"base64","media_type":"image/png","data":"{provider_data}"}},"uri":"{uri}"}}"#
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
    assert_eq!(result.media[0].decode().unwrap(), body);
    let compact: Value = serde_json::from_str(&result.compact_json).unwrap();
    let compact_embedded = compact["text"].as_str().unwrap();
    assert!(compact_embedded.contains(r#""type":"base64""#));
    assert!(compact_embedded.contains(&provider_data));
}

#[test]
fn bounded_text_scan_leaves_escaped_uri_spelling_inline() {
    let plain_body = vec![b'p'; MIN_EARLY_MEDIA_BYTES];
    let plain_uri = data_uri(&plain_body);
    let escaped_body = vec![0xff; MIN_EARLY_MEDIA_BYTES];
    let escaped_base64 = BASE64.encode(&escaped_body);
    for escaped_uri in [
        format!("data:image/png;base64,\\/\\/\\/\\/{}", &escaped_base64[4..]),
        format!(r"data:image/png;name=C:\\img\\a.png;base64,{escaped_base64}"),
        format!(r"data:image/png;name=snow\u2603;base64,{escaped_base64}"),
    ] {
        let mut embedded = format!(r#"{{"escaped":"{escaped_uri}","plain":"{plain_uri}"}}"#);
        for _ in 0..3 {
            embedded = format!(
                r#"{{"embedded":{}}}"#,
                serde_json::to_string(&embedded).unwrap()
            );
        }
        let two_layer_input = format!(r#"{{"deep":{embedded}}}"#);
        let mut deep = format!(r#"{{"escaped":"{escaped_uri}","plain":"{plain_uri}"}}"#);
        for _ in 0..300 {
            deep = format!(r#"{{"nested":{deep}}}"#);
        }
        let deep_input = format!(r#"{{"text":{}}}"#, serde_json::to_string(&deep).unwrap());

        for input in [two_layer_input, deep_input] {
            let result = extract_media(input.as_bytes()).expect("valid nested JSON");
            assert_eq!(result.media.len(), 1);
            assert_eq!(result.media[0].decode().unwrap(), plain_body);
            let expected = input.replacen(&plain_uri, &result.media[0].reference(), 1);
            assert_eq!(result.compact_json, expected);
        }
    }
}

#[test]
fn preserves_json_escaping_and_scans_nested_stringified_json() {
    let (encoded, body) = large_base64(b"nested");
    let nested = format!(
        r#"{{"type":"base64","media_type":"image/png","data":"{}"}}"#,
        encoded
    );
    let encoded_nested = serde_json::to_string(&nested).expect("serialize nested JSON");
    let input = format!(r#"{{"text":{encoded_nested}}}"#);
    let result = extract_media(input.as_bytes()).expect("valid JSON");

    assert_eq!(result.media.len(), 1);
    let compact = result.compact_json;
    assert!(compact.contains("@@@langfuseMedia:type=image/png|id="));
    assert_eq!(result.media[0].kind, MediaPayloadKind::Anthropic);
    assert_eq!(result.media[0].original_value().unwrap(), encoded);
    assert_eq!(result.media[0].decode().unwrap(), body);
}

#[test]
fn scans_sdk_json_string_wrappers_within_the_embedded_json_budget() {
    let (uri, uri_body) = large_data_uri(b"sdk-uri");
    let (provider_data, provider_body) = large_base64(b"sdk-provider");
    let uri_metadata = format!(r#"{{"image":"{uri}"}}"#);
    let provider_metadata =
        format!(r#"{{"type":"file","mediaType":"image/png","data":"{provider_data}"}}"#);
    // The SDK JSON-encodes the metadata value, so stringValue contains a
    // quoted JSON representation of either metadata JSON text or a raw string.
    let uri_string_value = serde_json::to_string(&uri_metadata).unwrap();
    let raw_uri_string_value = serde_json::to_string(&uri).unwrap();
    let provider_string_value = serde_json::to_string(&provider_metadata).unwrap();
    let input = serde_json::to_vec(&json!({
        "resourceSpans": [{
            "scopeSpans": [{
                "spans": [{
                    "attributes": [
                        {
                            "key": "metadata.attachment",
                            "value": {"stringValue": uri_string_value}
                        },
                        {
                            "key": "metadata.raw-attachment",
                            "value": {"stringValue": raw_uri_string_value}
                        },
                        {
                            "key": "metadata.provider",
                            "value": {"stringValue": provider_string_value}
                        }
                    ]
                }]
            }]
        }]
    }))
    .unwrap();

    let result = extract_media(&input).expect("valid OTLP JSON");

    assert_eq!(result.media.len(), 3);
    assert_eq!(result.media[0].decode().unwrap(), uri_body);
    assert_eq!(result.media[1].decode().unwrap(), uri_body);
    assert_eq!(result.media[2].decode().unwrap(), provider_body);
    let mut expected = String::from_utf8(input).unwrap();
    expected = expected.replacen(&uri, &result.media[0].reference(), 1);
    expected = expected.replacen(&uri, &result.media[1].reference(), 1);
    expected = expected.replace(&provider_data, &result.media[2].reference());
    assert_eq!(result.compact_json, expected);
}

#[test]
fn limits_embedded_documents_without_losing_uri_text_or_siblings() {
    let (provider_data, provider_body) = large_base64(b"provider");
    let (deep_uri, deep_body) = large_data_uri(b"at-limit");
    let (quoted_uri, quoted_body) = large_data_uri(b"quoted");
    let (sibling_uri, sibling_body) = large_data_uri(b"sibling");
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
                provider_body.clone(),
                deep_body.clone(),
                quoted_body.clone(),
                sibling_body.clone(),
            ]
        } else if layers == 3 {
            vec![deep_body.clone(), quoted_body.clone(), sibling_body.clone()]
        } else {
            // Further quoting leaves a backslash after the payload, which is not
            // a valid URI terminator for text-only scanning.
            vec![deep_body.clone(), sibling_body.clone()]
        };
        assert_eq!(bodies, expected_bodies, "embedded layers: {layers}");
        let mut expected = input;
        for media in &result.media {
            expected = expected.replacen(&media.original_value().unwrap(), &media.reference(), 1);
        }
        assert_eq!(result.compact_json, expected);
    }
}

#[test]
fn scans_unicode_escaped_provider_keys_in_nested_json() {
    let (encoded, body) = large_base64(b"unicode-key");
    let nested = format!(r#"{{"type":"base64","media_\u0074ype":"image/png","data":"{encoded}"}}"#);
    let encoded_nested = serde_json::to_string(&nested).expect("serialize nested JSON");
    let input = format!(r#"{{"text":{encoded_nested}}}"#);

    let result = extract_media(input.as_bytes()).expect("valid nested provider JSON");

    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].decode().unwrap(), body);
}

#[test]
fn recognizes_provider_shapes_and_python_bytes() {
    let (encoded, encoded_body) = large_base64(b"provider");
    let mut python_body = vec![b'x'; MIN_EARLY_MEDIA_BYTES];
    python_body[..4].copy_from_slice(b"abcd");
    let python_literal = format!("b'{}'", String::from_utf8(python_body.clone()).unwrap());
    let input = format!(
        r#"[{{"type":"media","mime_type":"image/png","data":"{encoded}"}},{{"type":"file","mediaType":"image/png","data":"{python_literal}"}}]"#
    );
    let result = extract_media(input.as_bytes()).expect("valid JSON");
    assert_eq!(result.media.len(), 2);
    assert_eq!(result.media[0].kind, MediaPayloadKind::Vertex);
    assert_eq!(result.media[1].kind, MediaPayloadKind::AiSdkV6);
    assert_eq!(result.media[0].decode().unwrap(), encoded_body);
    assert_eq!(result.media[1].decode().unwrap(), python_body);
}

#[test]
fn data_uri_provider_fields_use_the_uri_metadata() {
    let (uri, body) = large_data_uri(b"provider-uri");
    for input in [
        format!(r#"{{"type":"file","mediaType":"image/jpeg","data":"{uri}"}}"#),
        format!(r#"{{"type":"base64","media_type":"image/jpeg","data":"{uri}"}}"#),
    ] {
        let result = extract_media(input.as_bytes()).expect("valid provider Data URI");

        assert_eq!(result.media.len(), 1);
        let media = &result.media[0];
        assert_eq!(media.kind, MediaPayloadKind::DataUri);
        assert_eq!(media.metadata.content_type, "image/png");
        assert_eq!(media.metadata.source, MediaSource::Base64DataUri);
        assert_eq!(media.decode().unwrap(), body);
    }
}

#[test]
fn nested_provider_original_value_preserves_inner_json_escapes() {
    let (base64, base64_body) = large_base64(b"escaped");
    let escaped_base64 = format!(
        r#"data:image/png;base64,\u{:04x}{}"#,
        base64.as_bytes()[0],
        &base64[1..]
    );
    let slash_body = vec![0xff; MIN_EARLY_MEDIA_BYTES];
    let slash_base64 = BASE64.encode(&slash_body);
    let escaped_slashes = format!("data:image/png;base64,\\/\\/\\/\\/{}", &slash_base64[4..]);
    let python_body = {
        let mut body = vec![b'x'; MIN_EARLY_MEDIA_BYTES];
        body[0] = b'"';
        body
    };
    let python_source = format!("b'\\u0022{}'", "x".repeat(MIN_EARLY_MEDIA_BYTES - 1));
    let cases = [
        (
            format!(r#"{{"type":"file","mediaType":"image/png","data":"{escaped_base64}"}}"#),
            escaped_base64,
            format!("data:image/png;base64,{}", base64),
            base64_body,
        ),
        (
            format!(r#"{{"type":"file","mediaType":"image/png","data":"{escaped_slashes}"}}"#),
            escaped_slashes,
            format!("data:image/png;base64,{}", slash_base64),
            slash_body,
        ),
        (
            format!(r#"{{"type":"file","mediaType":"text/plain","data":"{python_source}"}}"#),
            python_source,
            format!("b'{}'", String::from_utf8_lossy(&python_body)),
            python_body,
        ),
    ];

    for (nested, expected_original, expected_decoded, expected_body) in cases {
        let encoded_nested = serde_json::to_string(&nested).expect("serialize nested JSON");
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
    let python_body = "x".repeat(MIN_EARLY_MEDIA_BYTES - 1);
    let provider =
        format!(r#"{{"type":"file","mediaType":"text/plain","data":"b'\u0022{python_body}'"}}"#);
    let encoded_provider = serde_json::to_string(&provider)
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
    let expected_original = format!(r#"b'\\u0022{}'"#, python_body);
    assert_eq!(media.original_value().unwrap(), expected_original);
    assert_eq!(
        media.original_value_for_layers(Some(2)).unwrap(),
        expected_original
    );
    assert_eq!(
        media.original_value_for_layers(Some(1)).unwrap(),
        format!(r#"b'\u0022{}'"#, python_body)
    );
    assert_eq!(
        media.original_value_for_layers(Some(0)).unwrap(),
        format!("b'\"{}'", python_body)
    );
    assert!(matches!(
        media.original_value_for_layers(Some(17)),
        Err(super::payload::MediaDecodeError::JsonLayerLimit)
    ));

    let compact: Value = serde_json::from_str(&result.compact_json).unwrap();
    let compact_first_layer = compact["text"].as_str().unwrap();
    let reference = media.reference();
    assert_eq!(
        compact_first_layer.replace(&reference, &media.original_value().unwrap()),
        first_layer
    );
}

#[test]
fn keeps_embedded_provider_documents_in_payload_mode() {
    let (encoded, body) = large_base64(b"embedded-provider");
    let nested = format!(
        r#"{{"scopeSpans":"provider field","type":"file","mediaType":"image/png","data":"{encoded}"}}"#
    );
    let encoded_nested = serde_json::to_string(&nested).expect("serialize nested JSON");
    let input = format!(r#"{{"text":{encoded_nested}}}"#);

    let result = extract_media(input.as_bytes()).expect("valid embedded provider JSON");

    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].decode().unwrap(), body);
}

#[test]
fn classifies_each_root_array_object_before_discovery() {
    let (provider_data, provider_body) = large_base64(b"provider-first");
    let (envelope_uri, envelope_body) = large_data_uri(b"envelope-second");
    let (structural_uri, _) = large_data_uri(b"structural-name");
    let input = format!(
        r#"[{{"type":"file","mediaType":"image/png","data":"{provider_data}"}},{{"scopeSpans":[{{"scope":{{"name":"{structural_uri}"}},"spans":[{{"attributes":[{{"key":"{structural_uri}","value":{{"stringValue":"{envelope_uri}"}}}}]}}]}}]}}]"#
    );

    let result = extract_media(input.as_bytes()).expect("valid mixed root array");

    assert_eq!(result.media.len(), 2);
    assert_eq!(result.media[0].decode().unwrap(), provider_body);
    assert_eq!(result.media[1].decode().unwrap(), envelope_body);
    let compact: Value = serde_json::from_str(&result.compact_json).unwrap();
    assert_eq!(compact[1]["scopeSpans"][0]["scope"]["name"], structural_uri);
    assert_eq!(
        compact[1]["scopeSpans"][0]["spans"][0]["attributes"][0]["key"],
        structural_uri
    );
}

#[test]
fn indexed_subtrees_survive_mixed_siblings_and_provider_lookahead() {
    let (uri, body) = large_data_uri(b"deep");
    let (provider_data, provider_body) = large_base64(b"provider");
    let chain = (0..118).fold(format!("\"{uri}\""), |value, level| {
        if level % 2 == 0 {
            format!(r#"{{"x":{value}}}"#)
        } else {
            format!("[{value}]")
        }
    });
    let provider = format!(
        r#"{{"inline_data":{{"mime_type":"image/png","data":"{provider_data}","other":[{{"x":[0]}}]}},"siblings":[{{}},[{{"x":[]}}]]}}"#
    );
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
            [
                body.as_slice(),
                provider_body.as_slice(),
                provider_body.as_slice(),
                body.as_slice()
            ]
            .repeat(repetitions)
        );
    }
}

#[test]
fn existing_references_and_tiny_candidates_stay_inline_with_bounded_retention() {
    let reference = format!(
        "@@@langfuseMedia:type=image/png|id={}@@@",
        "x".repeat(8 * 1024)
    );
    let references = (0..16_385)
        .map(|index| format!("@@@langfuseMedia:type=image/png|id={index}@@@"))
        .collect::<Vec<_>>();
    let tiny_uri = data_uri(b"candidate");
    let tiny_candidates = std::iter::repeat_n(tiny_uri.as_str(), 16 * 1024 + 1)
        .collect::<Vec<_>>()
        .join(" ");
    for (text, retained_multiplier) in [
        (reference, 3),
        (references.join(" "), 3),
        (tiny_candidates, 4),
    ] {
        let input = format!(r#"{{"existing":"{text}"}}"#);
        let (validated, scanned, _, unique, retained_bytes) =
            validate_measured(input.as_bytes().to_vec()).unwrap();
        assert_eq!(unique, 0);
        assert!(scanned <= 3 * input.len());
        assert!(
            retained_bytes <= retained_multiplier * input.len(),
            "retained {retained_bytes} bytes for {} source bytes",
            input.len()
        );
        let result = validated.compact().unwrap();
        assert!(result.media.is_empty());
        assert_eq!(result.compact_json, input);
    }
}

#[test]
fn unique_and_escaped_candidates_have_input_proportional_retention() {
    let uris = (0..1_024u32)
        .map(|value| {
            let mut payload = vec![b'x'; MIN_EARLY_MEDIA_BYTES];
            payload[..4].copy_from_slice(&value.to_le_bytes());
            data_uri(&payload)
        })
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
        assert_eq!(result.media.len(), uris.len());
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
    assert_eq!(result.compact_json, input);
}

#[test]
fn non_candidates_stay_inline() {
    let (uri, _) = large_data_uri(b"inline");
    let prefix = "A".repeat(MIN_EARLY_MEDIA_BYTES);
    let filler = "x".repeat(MIN_EARLY_MEDIA_BYTES);
    let repeated = "abc".repeat(MIN_EARLY_MEDIA_BYTES);
    // Fields whose value fails validation: a Data URI body that is not base64 or has excess
    // padding, a content type outside the supported list, and a provider body with excess padding.
    let rejected = [
        format!(r#""invalid":"data:image/png;base64,{prefix}not#base64""#),
        format!(r#""invalid_padding":"data:image/png;base64,{prefix}AAAA===""#),
        format!(r#""unsupported":"data:application/x-unknown;base64,{prefix}aGk=""#),
        format!(
            r#""provider":{{"type":"base64","media_type":"image/png","data":"{prefix}AAAA==="}}"#
        ),
    ];
    let mut cases = vec![
        // A provider field must hold nothing but the Data URI.
        format!(r#"{{"type":"file","mediaType":"image/png","data":"{uri} trailing"}}"#),
        // Python bytes literals holding a non-ASCII character or an escaped closing quote.
        format!(r#"{{"type":"file","mediaType":"image/png","data":"b'{filler}text\u00e9'"}}"#),
        format!(r#"{{"type":"file","mediaType":"image/png","data":"b'{repeated}\\'"}}"#),
        format!(r#"{{"type":"file","mediaType":"image/png","data":"b\"{repeated}\\\""}}"#),
        // Object keys are never media.
        format!(r#"{{"{uri}":"ordinary value"}}"#),
    ];
    cases.extend(rejected.iter().map(|field| format!("{{{field}}}")));
    for input in &cases {
        let result = extract_media(input.as_bytes()).expect("valid JSON");
        assert!(result.media.is_empty(), "{input}");
        assert_eq!(&result.compact_json, input);
    }

    // Beside a valid Data URI, only that sibling is replaced.
    let input = format!(r#"{{"valid":"{uri}",{}}}"#, rejected.join(","));
    let result = extract_media(input.as_bytes()).expect("valid JSON");
    assert_eq!(result.media.len(), 1);
    assert_eq!(
        result.compact_json,
        input.replacen(&uri, &result.media[0].reference(), 1)
    );
}

#[test]
fn matches_data_uri_parameter_validation() {
    let (encoded, _) = large_base64(b"parameter");
    let valid = format!(
        r#"{{"type":"file","mediaType":"image/png","data":"data:image/png;charset=utf-8;base64,{encoded}"}}"#
    );
    let result = extract_media(valid.as_bytes()).expect("valid JSON");
    assert_eq!(result.media.len(), 1);

    let invalid = format!(
        r#"{{"type":"file","mediaType":"image/png","data":"data:image/png;charset=not valid;base64,{encoded}"}}"#
    );
    let result = extract_media(invalid.as_bytes()).expect("valid JSON");
    assert!(result.media.is_empty());
    assert_eq!(result.compact_json, invalid);
}

#[test]
fn extracts_user_payload_values_named_name_or_key() {
    let (name_uri, _) = large_data_uri(b"payload-name");
    let (key_uri, _) = large_data_uri(b"payload-key");
    let (nested_uri, _) = large_data_uri(b"nested-name");
    let input = serde_json::json!({
        "type": 1,
        "name": name_uri,
        "payload": { "type": "file", "mediaType": 42, "key": key_uri },
        "scope": { "name": nested_uri },
    });
    let source = serde_json::to_vec(&input).expect("serialize payload");
    let result = extract_media(&source).expect("valid JSON");
    let compact: Value = serde_json::from_str(&result.compact_json).expect("compact JSON");

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

/// Placeholders for string slots in an OTLP document template. Both are filled with the same
/// Data URI, which must survive in a kept slot and be extracted from a data slot.
const KEPT_SLOT: &str = "<kept>";
const DATA_SLOT: &str = "<data>";

fn otlp_slot(placeholder: &'static str) -> impl Strategy<Value = Value> {
    prop_oneof![Just(json!("plain")), Just(json!(placeholder))]
}

/// An OTLP `KeyValue` list, as used for attributes and for key-value list values. The key may
/// come before or after its value.
fn otlp_key_values(value: impl Strategy<Value = Value>) -> impl Strategy<Value = Value> {
    prop::collection::vec((otlp_slot(KEPT_SLOT), value, any::<bool>()), 0..3).prop_map(|entries| {
        entries
            .into_iter()
            .map(|(key, value, key_first)| {
                if key_first {
                    json!({"key": key, "value": value})
                } else {
                    json!({"value": value, "key": key})
                }
            })
            .collect()
    })
}

/// An OTLP `AnyValue`: a string, or an array or key-value list of further values.
fn otlp_any_value() -> impl Strategy<Value = Value> {
    let string = otlp_slot(DATA_SLOT).prop_map(|text| json!({"stringValue": text}));
    string.prop_recursive(3, 8, 3, |inner| {
        prop_oneof![
            prop::collection::vec(inner.clone(), 0..3)
                .prop_map(|values| json!({"arrayValue": {"values": values}})),
            otlp_key_values(inner).prop_map(|values| json!({"kvlistValue": {"values": values}})),
        ]
    })
}

/// A span or log envelope, rooted at its `resource*` field or at a bare array of resources.
fn otlp_template() -> impl Strategy<Value = String> {
    let kept = || otlp_slot(KEPT_SLOT);
    (
        (any::<bool>(), any::<bool>()),
        (
            otlp_key_values(otlp_any_value()),
            otlp_key_values(otlp_any_value()),
            otlp_any_value(),
        ),
        (kept(), kept(), kept(), kept(), kept(), kept()),
    )
        .prop_map(
            |(
                (logs, bare_array),
                (resource_attributes, attributes, body),
                (scope_name, scope_version, name, trace_id, unknown, event_name),
            )| {
                let record = if logs {
                    json!({
                        "severityText": name, "traceId": trace_id, "data": unknown,
                        "body": body, "attributes": attributes,
                    })
                } else {
                    json!({
                        "name": name, "traceId": trace_id, "data": unknown,
                        "attributes": attributes,
                        "events": [{
                            "name": event_name,
                            "attributes": [{"key": "detail", "value": body}],
                        }],
                    })
                };
                let (root, scopes, records) = if logs {
                    ("resourceLogs", "scopeLogs", "logRecords")
                } else {
                    ("resourceSpans", "scopeSpans", "spans")
                };
                let resource = json!({
                    "resource": {"attributes": resource_attributes},
                    scopes: [{
                        "scope": {"name": scope_name, "version": scope_version},
                        records: [record],
                    }],
                });
                if bare_array {
                    json!([resource]).to_string()
                } else {
                    json!({root: [resource]}).to_string()
                }
            },
        )
}

/// Fill every slot of `template` with `uri` and check that exactly the data slots are extracted.
fn check_otlp_slots(template: &str, uri: &str) -> Result<(), TestCaseError> {
    let input = template.replace(KEPT_SLOT, uri).replace(DATA_SLOT, uri);
    let result = extract_media(input.as_bytes()).expect("valid OTLP JSON");
    prop_assert_eq!(result.media.len(), template.matches(DATA_SLOT).count());
    let mut expected = template.replace(KEPT_SLOT, uri);
    for media in &result.media {
        expected = expected.replacen(DATA_SLOT, &media.reference(), 1);
    }
    prop_assert_eq!(result.compact_json, expected);
    Ok(())
}

#[test]
fn otlp_envelopes_extract_media_from_data_slots_only() {
    let (uri, _) = large_data_uri(b"slot");
    for template in [
        // A key-value list inside an array value of a resource attribute.
        json!({"resourceSpans": [{"resource": {"attributes": [{
            "key": "metadata",
            "value": {"arrayValue": {"values": [{"kvlistValue": {"values": [
                {"key": KEPT_SLOT, "value": {"stringValue": DATA_SLOT}}
            ]}}]}}
        }]}}]}),
        // Scope and span fields, including one the envelope does not define.
        json!({"resourceSpans": [{"scopeSpans": [{
            "scope": {"name": KEPT_SLOT, "version": "1"},
            "spans": [{
                "name": KEPT_SLOT,
                "traceId": KEPT_SLOT,
                "data": KEPT_SLOT,
                "attributes": [{"key": KEPT_SLOT, "value": {"stringValue": DATA_SLOT}}]
            }]
        }]}]}),
        // A bare array of resources.
        json!([{"scopeSpans": [{
            "scope": {"name": KEPT_SLOT},
            "spans": [{
                "name": KEPT_SLOT,
                "attributes": [{"key": KEPT_SLOT, "value": {"stringValue": DATA_SLOT}}]
            }]
        }]}]),
    ] {
        check_otlp_slots(&template.to_string(), &uri).unwrap();
    }

    proptest!(|(
        template in otlp_template(),
        body in prop::collection::vec(
            any::<u8>(),
            MIN_EARLY_MEDIA_BYTES..=MIN_EARLY_MEDIA_BYTES + 32,
        ),
    )| {
        check_otlp_slots(&template, &data_uri(&body))?;
    });
}

#[test]
fn leaves_lone_surrogate_strings_inline_and_extracts_siblings() {
    let (uri, body) = large_data_uri(b"sibling");
    for text in [r"\ud800", r"\udc00", r"\ud800\u0061"] {
        let input = format!(r#"{{"note":"{text}","image":"{uri}"}}"#);
        let result = extract_media(input.as_bytes()).expect("raw surrogate escape is valid JSON");
        assert_eq!(result.media.len(), 1);
        assert_eq!(result.media[0].decode().unwrap(), body);
        assert!(result.compact_json.contains(text));
    }
    let input = br#"{"value":"\ud83d\ude80"}"#;
    assert_eq!(extract_media(input).unwrap().compact_json.as_bytes(), input);
    for input in [br#"{"x":"\q"}"#.as_slice(), br#"{"x":"\ud800\uZZZZ"}"#] {
        assert!(matches!(
            extract_media(input),
            Err(EarlyMediaError::InvalidJson { .. })
        ));
    }
}

#[test]
fn malformed_utf8_is_replaced_before_discovery() {
    let (uri, body) = large_data_uri(b"abc");
    let mut input = b"{\"note\":\"".to_vec();
    input.extend([0xff, 0xe2, 0x82]);
    input.extend_from_slice(format!(r#"","image":"{uri}"}}"#).as_bytes());
    let result = extract_media(&input).unwrap();
    let compact: Value = serde_json::from_str(&result.compact_json).unwrap();
    assert_eq!(compact["note"], "��");
    assert_eq!(result.media[0].decode().unwrap(), body);
    assert_eq!(result.media[0].original_value().unwrap(), uri);
}

#[test]
fn embedded_json_keeps_surrogate_strings_and_extracts_sibling_fields() {
    let (uri, body) = large_data_uri(b"embedded");
    let nested = format!(r#"{{"note":"\ud800","image":"{uri}"}}"#);
    let input = serde_json::to_string(&nested).unwrap();
    let result = extract_media(input.as_bytes()).expect("embedded surrogate remains inline");
    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].decode().unwrap(), body);
    let expected = input.replace(&uri, &result.media[0].reference());
    assert_eq!(result.compact_json, expected);
}

#[test]
fn undecodable_keys_leave_their_values_inline_including_shadowed_values() {
    // Undecodable keys cannot participate in last-key-wins resolution. Preserve
    // their values while still extracting ordinary siblings.
    let (uri, body) = large_data_uri(b"sibling");
    let object = format!(r#"{{"\ud800":"{uri}","\uD800":"{uri}","ok":"{uri}"}}"#);
    for input in [object.to_owned(), serde_json::to_string(&object).unwrap()] {
        let result = extract_media(input.as_bytes()).unwrap();
        assert_eq!(result.media.len(), 1);
        assert_eq!(result.media[0].decode().unwrap(), body);
        let restored = result.compact_json.replace(
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
fn existing_public_references_are_preserved_beside_new_occurrences() {
    let (uri, _) = large_data_uri(b"collision");
    let (reference, _) = media_identity_from_encoded(
        uri.as_bytes(),
        "image/png",
        MediaSource::Base64DataUri,
        MediaEncoding::Base64DataUri,
    )
    .unwrap();
    let (encoded, _) = large_base64(b"structured");
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
        let restored = result
            .compact_json
            .replace(&pending, &result.media[0].original_value().unwrap());
        assert_eq!(restored, input);
    }
}

/// `width` sibling chains in an array, each nesting `uri` in `depth` containers: objects only,
/// or objects alternating with arrays.
fn nested_chains(uri: &str, depth: usize, width: usize, objects_only: bool) -> String {
    let chain = (0..depth).fold(format!("\"{uri}\""), |value, level| {
        if objects_only || level % 2 == 0 {
            format!(r#"{{"x":{value}}}"#)
        } else {
            format!("[{value}]")
        }
    });
    format!(
        "[{}]",
        std::iter::repeat_n(chain, width)
            .collect::<Vec<_>>()
            .join(",")
    )
}

/// Check the walk's cost and result for a document that holds `uri` `occurrences` times, at most
/// `depth` containers deep. Everything else in the document must stay as it is.
fn check_structural_work(
    input: &str,
    uri: &str,
    body: &[u8],
    occurrences: usize,
    depth: usize,
    embedded: bool,
) -> Result<(), TestCaseError> {
    let (validated, scanned, index_bytes, unique, _) =
        validate_measured(input.as_bytes().to_vec()).unwrap();
    // Bound source revisits instead of relying on a wall-clock threshold. Embedded documents
    // are validated separately, but each structural pass remains linear in that document's
    // source size.
    let passes = if embedded { 6 } else { 3 };
    prop_assert!(
        scanned <= passes * input.len(),
        "{} syntax bytes for {} input bytes",
        scanned,
        input.len()
    );
    // The walk retains open frames and candidates, not closed containers.
    // Allow fixed initial capacities as well as depth and result growth.
    prop_assert!(
        index_bytes <= 4096 + 512 * (depth + 3 + occurrences),
        "{} index bytes",
        index_bytes
    );
    let should_extract = uri.len() >= MIN_EARLY_MEDIA_BYTES;
    prop_assert_eq!(unique, usize::from(should_extract));
    let result = validated.compact().unwrap();
    prop_assert_eq!(
        result.media.len(),
        if should_extract { occurrences } else { 0 }
    );
    let mut expected = input.to_owned();
    for media in &result.media {
        let decoded = media.decode().unwrap();
        prop_assert_eq!(decoded.as_slice(), body);
        expected = expected.replacen(uri, &media.reference(), 1);
    }
    prop_assert_eq!(result.compact_json, expected);
    Ok(())
}

#[test]
fn structural_work_stays_proportional_across_depth_width_and_embedded_json() {
    // A body below the size cutoff stays inline beside one that is extracted.
    let small = data_uri(&vec![b'x'; MIN_EARLY_MEDIA_BYTES / 2]);
    let (large, large_body) = large_data_uri(b"large");
    let input = format!(r#"{{"small":"{small}","large":"{large}"}}"#);
    check_structural_work(&input, &large, &large_body, 1, 0, false).unwrap();
    // The deepest and widest generated shape, with objects only.
    let (uri, body) = large_data_uri(b"deep");
    let input = nested_chains(&uri, 120, 32, true);
    check_structural_work(&input, &uri, &body, 32, 120, false).unwrap();

    // Each complete four-character base64 group holds up to three body bytes.
    let largest_inline_body = MIN_EARLY_MEDIA_BYTES.saturating_sub(data_uri(&[]).len() + 1) / 4 * 3;
    let near_cutoff = largest_inline_body.saturating_sub(8)..=largest_inline_body + 8;
    proptest!(|(
        depth in 0usize..=120,
        width in 1usize..=32,
        objects_only in any::<bool>(),
        embedded in any::<bool>(),
        object_root in any::<bool>(),
        body in prop_oneof![
            prop::collection::vec(any::<u8>(), 1..24),
            prop::collection::vec(any::<u8>(), near_cutoff),
            prop::collection::vec(any::<u8>(), MIN_EARLY_MEDIA_BYTES..=MIN_EARLY_MEDIA_BYTES + 32),
        ],
    )| {
        let uri = data_uri(&body);
        let mut input = nested_chains(&uri, depth, width, objects_only);
        if object_root {
            input = format!(r#"{{"items":{input}}}"#);
        }
        if embedded {
            input = serde_json::to_string(&input).unwrap();
        }
        check_structural_work(&input, &uri, &body, width, depth, embedded)?;
    });
}

proptest! {
    #[test]
    fn same_content_occurrences_keep_unique_references_and_each_spelling(
        body in prop::collection::vec(
            prop::sample::select(b"abcdefghijklmnopqrstuvwxyz0123456789".to_vec()),
            MIN_EARLY_MEDIA_BYTES..=MIN_EARLY_MEDIA_BYTES + 32,
        ),
    ) {
        let encoded = BASE64.encode(&body);
        let python_literal = format!("b'{}'", String::from_utf8(body.clone()).unwrap());
        for (first, second) in [
            (python_literal.as_str(), python_literal.as_str()),
            (encoded.as_str(), python_literal.as_str()),
        ] {
            let input = format!(
                r#"[{{"type":"file","mediaType":"image/png","data":"{first}"}},{{"type":"file","mediaType":"image/png","data":"{second}"}}]"#
            );
            let result = extract_media(input.as_bytes()).expect("valid duplicate providers");
            prop_assert_eq!(result.media.len(), 2);
            let first_media = &result.media[0];
            let second_media = &result.media[1];
            let first_reference = first_media.reference();
            let second_reference = second_media.reference();
            prop_assert_ne!(first_reference.as_str(), second_reference.as_str());
            prop_assert_eq!(
                &first_media.metadata.sha256_hash,
                &second_media.metadata.sha256_hash
            );
            prop_assert_eq!(first_media.original_value().unwrap(), first);
            prop_assert_eq!(second_media.original_value().unwrap(), second);
            let first_decoded = first_media.decode().unwrap();
            let second_decoded = second_media.decode().unwrap();
            prop_assert_eq!(first_decoded.as_slice(), body.as_slice());
            prop_assert_eq!(second_decoded.as_slice(), body.as_slice());
            let expected = input
                .replacen(first, &first_reference, 1)
                .replacen(second, &second_reference, 1);
            prop_assert_eq!(result.compact_json, expected);
        }
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
        let validated = validate(source.clone()).expect("generated JSON validates");
        prop_assert_eq!(validated.into_source().into_bytes(), source.as_slice());
        source.push(b'x');
        let mut directed = br#"{"traceId":{"type":"Buffer","data":[1,2,3]},"text":"plain"}"#.to_vec();
        directed.push(b'x');
        let directed_rejected = matches!(
            validate(directed),
            Err(EarlyMediaError::TrailingBytes { .. })
        );
        prop_assert!(directed_rejected);
        let validation_rejected = matches!(
            validate(source.clone()),
            Err(EarlyMediaError::TrailingBytes { .. })
                | Err(EarlyMediaError::InvalidJson { .. })
        );
        prop_assert!(validation_rejected);
        let rejected = matches!(
            extract_media(&source),
            Err(EarlyMediaError::TrailingBytes { .. })
                | Err(EarlyMediaError::InvalidJson { .. })
        );
        prop_assert!(rejected);
    }
}
