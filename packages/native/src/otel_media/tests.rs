use super::*;
use proptest::prelude::*;
use serde_json::{json, Value};

fn json_string_strategy() -> BoxedStrategy<String> {
    prop::collection::vec(any::<char>(), 0..32)
        .prop_map(|characters| characters.into_iter().collect())
        .boxed()
}

fn json_value_strategy(depth: u8) -> BoxedStrategy<Value> {
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

fn data_uri(payload: &[u8]) -> String {
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
    let uri = data_uri(b"nested");
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
    assert!(!compact.contains("nested"));
    assert_eq!(result.media[0].kind, MediaPayloadKind::Anthropic);
    assert_eq!(
        result.media[0].original_value().unwrap(),
        BASE64.encode(b"nested")
    );
    let _ = uri;
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
fn accepts_the_unpadded_base64_that_node_accepts() {
    let data_uri = br#"{"input":"data:image/png;base64,aGk"}"#;
    let result = extract_media(data_uri).expect("valid JSON");
    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].decode().unwrap(), b"hi");

    let structured = br#"{"type":"file","mediaType":"image/png","data":"aGk"}"#;
    let result = extract_media(structured).expect("valid JSON");
    assert_eq!(result.media.len(), 1);
    assert_eq!(result.media[0].decode().unwrap(), b"hi");
}

#[test]
fn hashes_large_base64_across_chunk_boundaries_with_or_without_padding() {
    // 12,289 decoded bytes produce a padded tail after one complete 16 KiB
    // encoded chunk. Exercise both the padded and Node-compatible unpadded form.
    let decoded = (0usize..12_289)
        .map(|index| index.wrapping_mul(31) as u8)
        .collect::<Vec<_>>();
    let padded = BASE64.encode(&decoded);
    let unpadded = padded.trim_end_matches('=');
    let expected: [u8; 32] = Sha256::digest(&decoded).into();

    assert_eq!(
        hash_encoded_data(padded.as_bytes(), MediaEncoding::Base64).unwrap(),
        expected
    );
    assert_eq!(
        hash_encoded_data(unpadded.as_bytes(), MediaEncoding::Base64).unwrap(),
        expected
    );
}

#[test]
fn python_bytes_decoder_and_hasher_share_escape_validation() {
    let encoded = br#"b"abc\n\r\t\\\'\"\x41""#;
    let expected = b"abc\n\r\t\\'\"A";
    let expected_hash: [u8; 32] = Sha256::digest(expected).into();
    assert_eq!(decode_python_bytes_literal(encoded).unwrap(), expected);
    assert_eq!(
        hash_encoded_data(encoded, MediaEncoding::PythonBytesLiteral).unwrap(),
        expected_hash
    );

    for invalid in [b"b'bad\\q'".as_slice(), b"b'bad\\x0'", b"b'caf\xc3\xa9'"] {
        assert!(matches!(
            decode_python_bytes_literal(invalid),
            Err(MediaDecodeError::InvalidPythonBytes)
        ));
        assert!(matches!(
            hash_encoded_data(invalid, MediaEncoding::PythonBytesLiteral),
            Err(MediaDecodeError::InvalidPythonBytes)
        ));
    }
}

#[test]
fn hashes_large_python_bytes_literals_in_bounded_chunks() {
    let decoded = vec![b'a'; BASE64_HASH_DECODED_CHUNK_SIZE + 17];
    let mut encoded = Vec::with_capacity(decoded.len() + 3);
    encoded.extend_from_slice(b"b'");
    encoded.extend_from_slice(&decoded);
    encoded.push(b'\'');
    let expected_hash: [u8; 32] = Sha256::digest(&decoded).into();

    assert_eq!(
        hash_encoded_data(&encoded, MediaEncoding::PythonBytesLiteral).unwrap(),
        expected_hash
    );
}

#[test]
fn rejects_raw_non_ascii_python_bytes_literals_like_typescript() {
    let input = br#"{"type":"file","mediaType":"image/png","data":"b'caf\u00e9'"}"#;
    let result = extract_media(input).expect("valid JSON");
    assert!(result.media.is_empty());
    assert_eq!(result.compact_json, input);
}

#[test]
fn leaves_invalid_and_unsupported_candidates_inline() {
    let input = br#"{"valid":"data:image/png;base64,aGk=","invalid":"data:image/png;base64,not#base64","invalid_padding":"data:image/png;base64,AAAA==","unsupported":"data/application/x-unknown;base64,aGk=","provider":{"type":"base64","media_type":"image/png","data":"AAAA=="}}"#;
    let result = extract_media(input).expect("valid JSON");
    assert_eq!(result.media.len(), 1);
    let compact = String::from_utf8(result.compact_json).unwrap();
    assert!(compact.contains("not#base64"));
    assert!(compact.contains("AAAA=="));
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
        "name": name_uri,
        "payload": { "key": key_uri },
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
fn discovery_keeps_the_source_until_the_accepted_payload_is_compacted() {
    let uri = data_uri(b"discovery");
    let input = format!(r#"{{"input":"{uri}","keep":"ordinary"}}"#).into_bytes();
    let validated = validate_and_discover(input.clone()).expect("valid JSON");
    assert_eq!(validated.manifest.entries.len(), 1);
    assert_eq!(validated.source(), input.as_slice());
    let source_ptr = validated.source().as_ptr();

    let compacted = validated.compact().expect("manifest matches source");
    assert_eq!(compacted.media.len(), 1);
    assert!(String::from_utf8(compacted.compact_json)
        .unwrap()
        .contains("@@@langfuseMedia:type=image/png|id="));
    assert!(matches!(
        &compacted.media[0].storage,
        MediaStorage::Source { .. }
    ));
    let MediaStorage::Source { bytes, .. } = &compacted.media[0].storage else {
        unreachable!("direct media should retain a source range");
    };
    assert_eq!(bytes.as_ptr(), source_ptr);
}

#[test]
fn compaction_changes_only_the_bytes_inside_discovered_data_uris() {
    let first_uri = data_uri(b"offset-first");
    let second_uri = data_uri(b"offset-second");
    let third_uri = data_uri(b"offset-third");
    let input = format!(
        "{{\n  \"text\"   : \"before {first_uri} / {second_uri} after\",\n  \"number\" : 1.2300e+04,\n  \"attachment\" : \"{third_uri}\"\n}}"
    );
    let validated = validate_and_discover(input.as_bytes().to_vec()).expect("valid JSON");
    let compacted = validated.compact().expect("manifest matches source");

    assert_eq!(compacted.media.len(), 3);
    let mut expected = input;
    for (uri, media) in [first_uri, second_uri, third_uri]
        .iter()
        .zip(&compacted.media)
    {
        assert_eq!(media.original_value().unwrap(), *uri);
        expected = expected.replacen(uri, &media.reference, 1);
    }
    assert_eq!(String::from_utf8(compacted.compact_json).unwrap(), expected);
}

#[test]
fn provider_media_retains_source_backed_storage_during_compaction() {
    let encoded = BASE64.encode(b"provider");
    let input =
        format!(r#"{{"type":"media","mime_type":"image/png","data":"{encoded}"}}"#).into_bytes();
    let validated = validate_and_discover(input).expect("valid JSON");
    assert_eq!(validated.manifest.entries.len(), 1);
    let compacted = validated.compact().expect("manifest matches source");
    assert!(matches!(
        &compacted.media[0].storage,
        MediaStorage::Source { .. }
    ));
    assert_eq!(compacted.media[0].decode().unwrap(), b"provider");
}

#[test]
fn nested_json_manifest_is_reused_for_the_accepted_payload() {
    let provider = r#"{"type":"base64","media_type":"image/png","data":"aGk="}"#;
    let nested = format!(
        r#"{{ "prefix" : "café\/雪\u2603", "layer" : {{ "provider" : {provider} }}, "number" : 1.2300e+04 }}"#
    );
    let encoded_nested = serde_json::to_string(&nested).expect("serialize nested JSON");
    let input = format!("{{\n  \"input\" : {encoded_nested},\n  \"number\" : 7.000e0\n}}");
    let validated = validate_and_discover(input.as_bytes().to_vec()).expect("valid JSON");
    assert_eq!(validated.manifest.entries.len(), 1);
    let source_ptr = validated.source().as_ptr();
    let compacted = validated.compact().expect("manifest matches source");
    assert_eq!(compacted.media.len(), 1);
    assert_eq!(compacted.media[0].decode().unwrap(), b"hi");
    assert_eq!(compacted.media[0].original_value().unwrap(), "aGk=");
    let expected = input.replacen("aGk=", &compacted.media[0].reference, 1);
    assert_eq!(String::from_utf8(compacted.compact_json).unwrap(), expected);
    let MediaStorage::Source { bytes, range } = &compacted.media[0].storage else {
        panic!("ASCII-safe nested media should retain the outer source range");
    };
    assert_eq!(bytes.as_ptr(), source_ptr);
    assert_eq!(&bytes[range.clone()], b"aGk=");

    let uri = data_uri(b"escaped-candidate");
    let (header, payload) = uri.split_once(',').unwrap();
    let escaped_uri = format!("{header},\\u{:04x}{}", payload.as_bytes()[0], &payload[1..]);
    let escaped_input = format!("{{\n  \"image\" : \"{escaped_uri}\"\n}}");
    let escaped_validated =
        validate_and_discover(escaped_input.as_bytes().to_vec()).expect("valid escaped URI");
    let escaped_result = escaped_validated
        .compact()
        .expect("escaped media manifest matches source");
    assert_eq!(escaped_result.media.len(), 1);
    assert_eq!(escaped_result.media[0].original_value().unwrap(), uri);
    assert_eq!(
        escaped_result.media[0].decode().unwrap(),
        b"escaped-candidate"
    );
    let expected = escaped_input.replacen(&escaped_uri, &escaped_result.media[0].reference, 1);
    assert_eq!(
        String::from_utf8(escaped_result.compact_json).unwrap(),
        expected
    );
    assert!(matches!(
        &escaped_result.media[0].storage,
        MediaStorage::Owned(_)
    ));
}

#[test]
fn nested_duplicate_providers_compact_at_their_original_source_spans() {
    let first_data = "aGk=";
    let second_data = BASE64.encode(b"longer media payload");
    let first_provider =
        format!(r#"{{ "type" : "base64", "media_type" : "image/png", "data" : "{first_data}" }}"#);
    let second_provider =
        format!(r#"{{ "type" : "base64", "media_type" : "image/png", "data" : "{second_data}" }}"#);
    let encoded_first = serde_json::to_string(&first_provider).expect("serialize first provider");
    let encoded_second =
        serde_json::to_string(&second_provider).expect("serialize second provider");
    let input = format!(
        "{{\n  \"first\" : {encoded_first},\n  \"prefix\" : \"café\\/雪\\u2603\",\n  \"second\" : {encoded_second},\n  \"number\" : 1.2300e+04\n}}"
    );
    let validated = validate_and_discover(input.as_bytes().to_vec()).expect("discovery");
    let source_ptr = validated.source().as_ptr();
    let compacted = validated.compact().expect("manifest matches source");

    assert_eq!(compacted.media.len(), 2);
    assert_eq!(compacted.media[0].original_value().unwrap(), first_data);
    assert_eq!(compacted.media[1].original_value().unwrap(), second_data);
    let expected = input
        .replacen(first_data, &compacted.media[0].reference, 1)
        .replacen(&second_data, &compacted.media[1].reference, 1);
    assert_eq!(String::from_utf8(compacted.compact_json).unwrap(), expected);
    for (media, expected_range) in compacted.media.iter().zip([first_data, &second_data]) {
        let MediaStorage::Source { bytes, range } = &media.storage else {
            panic!("ASCII-safe nested media should retain the source range");
        };
        assert_eq!(bytes.as_ptr(), source_ptr);
        assert_eq!(&bytes[range.clone()], expected_range.as_bytes());
    }
    assert_eq!(compacted.media[0].decode().unwrap(), b"hi");
    assert_eq!(
        compacted.media[1].decode().unwrap(),
        b"longer media payload"
    );
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
        validate_and_discover(input.clone().into_bytes()),
        Err(EarlyMediaError::UnsupportedMediaReferenceAmbiguity { .. })
    ));
    assert!(matches!(
        extract_media(input.as_bytes()),
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
    fn compaction_preserves_source_bytes_around_generated_data_uri(
        suffix in json_string_strategy(),
        payloads in prop::collection::vec(prop::collection::vec(any::<u8>(), 1..32), 3..5),
        layers in 0usize..4,
    ) {
        let prefix = format!("café-雪{suffix}");
        let prefix_json = serde_json::to_string(&prefix).expect("serialize prefix");
        let uris = payloads
            .iter()
            .enumerate()
            .map(|(index, payload)| {
                let mut unique_payload = payload.clone();
                unique_payload.push(index as u8);
                data_uri(&unique_payload)
            })
            .collect::<Vec<_>>();
        let inline_uris = uris[..2].join(" / ");
        let other_uris = uris[2..]
            .iter()
            .map(|uri| format!("\"{uri}\""))
            .collect::<Vec<_>>()
            .join(", ");
        let mut source = format!(
            "{{\n  \"prefix\" : {prefix_json},\n  \"media\" : \"before {inline_uris} after\",\n  \"attachments\" : [{other_uris}],\n  \"slash\" : \"left\\/right\",\n  \"number\" : 1.2300e+04\n}}"
        );
        for layer in 0..layers {
            let encoded = serde_json::to_string(&source).expect("serialize nested source");
            source = format!("{{ \n  \"layer{layer}\" : {encoded} \n}}");
        }
        let validated = validate_and_discover(source.as_bytes().to_vec())
            .expect("generated nested JSON is valid");
        prop_assert_eq!(
            validated.manifest.entries.len(),
            uris.len(),
            "source: {:?}; URIs: {:?}",
            source,
            uris
        );
        let compacted = validated.compact().expect("manifest matches source");
        prop_assert_eq!(compacted.media.len(), uris.len());
        let mut expected = source;
        for (uri, media) in uris.iter().zip(&compacted.media) {
            prop_assert_eq!(media.original_value().unwrap(), uri.as_str());
            expected = expected.replacen(uri, &media.reference, 1);
            match &media.storage {
                MediaStorage::Source { bytes, range } => {
                    prop_assert_eq!(&bytes[range.clone()], uri.as_bytes());
                }
                MediaStorage::Owned(_) => prop_assert!(false, "ASCII media should use a source range"),
            }
        }
        prop_assert_eq!(String::from_utf8(compacted.compact_json).unwrap(), expected);
    }

    #[test]
    fn valid_json_values_survive_scan_and_compaction(
        value in json_value_strategy(6),
    ) {
        let source = serde_json::to_vec(&value).expect("serialize generated JSON");
        let validated = match validate_and_discover(source.clone()) {
            Ok(validated) => validated,
            // Ambiguous public references intentionally fall back to the TypeScript path;
            // they are valid JSON but outside this representation's lossless contract.
            Err(EarlyMediaError::UnsupportedMediaReferenceAmbiguity { .. }) => return Ok(()),
            Err(error) => panic!("valid JSON was rejected: {error:?}"),
        };
        prop_assert_eq!(validated.source(), source.as_slice());

        let compacted = validated.compact().expect("discovered manifest is reusable");
        let compact: Value = serde_json::from_slice(&compacted.compact_json)
            .expect("compaction preserves valid JSON");
        if compacted.media.is_empty() {
            // With no media candidates, the scanner is only a validator and must preserve
            // the parsed value across arbitrary strings, keys, controls, and numbers.
            prop_assert_eq!(compact, value);
        }
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
