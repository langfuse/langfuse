use base64::Engine;
use proptest::prelude::*;
use serde_json::Value;

use super::super::encoding::BASE64;
use super::super::scanner::MIN_EARLY_MEDIA_BYTES;
use super::super::tests::{data_uri, json_string_strategy, json_value_strategy};
use super::super::validate;
use super::MediaStorage;

fn large_data_uri(label: &[u8]) -> (String, Vec<u8>) {
    let mut body = vec![b'x'; MIN_EARLY_MEDIA_BYTES];
    let copy_len = label.len().min(body.len());
    body[..copy_len].copy_from_slice(&label[..copy_len]);
    (data_uri(&body), body)
}

fn large_base64(label: &[u8]) -> (String, Vec<u8>) {
    let mut body = vec![b'x'; MIN_EARLY_MEDIA_BYTES];
    let copy_len = label.len().min(body.len());
    body[..copy_len].copy_from_slice(&label[..copy_len]);
    (BASE64.encode(&body), body)
}

#[test]
fn validation_keeps_the_source_until_the_accepted_payload_is_compacted() {
    let (uri, _) = large_data_uri(b"discovery");
    let input = format!(r#"{{"input":"{uri}","keep":"ordinary"}}"#).into_bytes();
    let validated = validate(input.clone()).expect("valid JSON");
    assert_eq!(validated.source.as_slice(), input.as_slice());
    let source_ptr = validated.source.as_ptr();

    let compacted = validated.compact().expect("compact media");
    assert_eq!(compacted.media.len(), 1);
    assert!(String::from_utf8(compacted.compact_json)
        .unwrap()
        .contains("@@@langfuseMedia:type=image/png|id="));
    let MediaStorage::Source { bytes, .. } = &compacted.media[0].storage else {
        unreachable!("direct media should retain a source range");
    };
    assert_eq!(bytes.as_ptr(), source_ptr);
}

#[test]
fn compaction_changes_only_the_bytes_inside_discovered_data_uris() {
    let (first_uri, _) = large_data_uri(b"offset-first");
    let (second_uri, _) = large_data_uri(b"offset-second");
    let (third_uri, _) = large_data_uri(b"offset-third");
    let input = format!(
        "{{\n  \"text\"   : \"before {first_uri} / {second_uri} after\",\n  \"number\" : 1.2300e+04,\n  \"attachment\" : \"{third_uri}\"\n}}"
    );
    let validated = validate(input.as_bytes().to_vec()).expect("valid JSON");
    let compacted = validated.compact().expect("compact media");

    assert_eq!(compacted.media.len(), 3);
    let mut expected = input;
    for (uri, media) in [first_uri, second_uri, third_uri]
        .iter()
        .zip(&compacted.media)
    {
        assert_eq!(media.original_value().unwrap(), *uri);
        expected = expected.replacen(uri, &media.reference(), 1);
    }
    assert_eq!(String::from_utf8(compacted.compact_json).unwrap(), expected);
}

#[test]
fn provider_media_retains_source_backed_storage_during_compaction() {
    let (encoded, body) = large_base64(b"provider");
    let input =
        format!(r#"{{"type":"media","mime_type":"image/png","data":"{encoded}"}}"#).into_bytes();
    let validated = validate(input).expect("valid JSON");
    let compacted = validated.compact().expect("compact media");
    assert!(matches!(
        &compacted.media[0].storage,
        MediaStorage::Source { .. }
    ));
    assert_eq!(compacted.media[0].decode().unwrap(), body);
}

#[test]
fn nested_json_compaction_retains_source_ranges() {
    let (provider_data, provider_body) = large_base64(b"nested");
    let provider =
        format!(r#"{{"type":"base64","media_type":"image/png","data":"{provider_data}"}}"#);
    let nested = format!(
        r#"{{ "prefix" : "café\/雪\u2603", "layer" : {{ "provider" : {provider} }}, "number" : 1.2300e+04 }}"#
    );
    let encoded_nested = serde_json::to_string(&nested).expect("serialize nested JSON");
    let input = format!("{{\n  \"input\" : {encoded_nested},\n  \"number\" : 7.000e0\n}}");
    let validated = validate(input.as_bytes().to_vec()).expect("valid JSON");
    let source_ptr = validated.source.as_ptr();
    let compacted = validated.compact().expect("compact media");
    assert_eq!(compacted.media.len(), 1);
    assert_eq!(compacted.media[0].decode().unwrap(), provider_body);
    assert_eq!(compacted.media[0].original_value().unwrap(), provider_data);
    let expected = input.replacen(&provider_data, &compacted.media[0].reference(), 1);
    assert_eq!(String::from_utf8(compacted.compact_json).unwrap(), expected);
    let MediaStorage::Source { bytes, range } = &compacted.media[0].storage else {
        panic!("ASCII-safe nested media should retain the outer source range");
    };
    assert_eq!(bytes.as_ptr(), source_ptr);
    assert_eq!(&bytes[range.clone()], provider_data.as_bytes());

    let (uri, uri_body) = large_data_uri(b"escaped-candidate");
    let (header, payload) = uri.split_once(',').unwrap();
    let escaped_uri = format!("{header},\\u{:04x}{}", payload.as_bytes()[0], &payload[1..]);
    let escaped_input = format!("{{\n  \"image\" : \"{escaped_uri}\"\n}}");
    let escaped_validated = validate(escaped_input.as_bytes().to_vec()).expect("valid escaped URI");
    let escaped_result = escaped_validated
        .compact()
        .expect("escaped media compaction succeeds");
    assert_eq!(escaped_result.media.len(), 1);
    assert_eq!(escaped_result.media[0].original_value().unwrap(), uri);
    assert_eq!(escaped_result.media[0].decode().unwrap(), uri_body);
    let expected = escaped_input.replacen(&escaped_uri, &escaped_result.media[0].reference(), 1);
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
    let (first_data, first_body) = large_base64(b"first provider");
    let (second_data, second_body) = large_base64(b"second provider");
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
    let validated = validate(input.as_bytes().to_vec()).expect("valid JSON");
    let source_ptr = validated.source.as_ptr();
    let compacted = validated.compact().expect("compact media");

    assert_eq!(compacted.media.len(), 2);
    assert_eq!(compacted.media[0].original_value().unwrap(), first_data);
    assert_eq!(compacted.media[1].original_value().unwrap(), second_data);
    let expected = input
        .replacen(&first_data, &compacted.media[0].reference(), 1)
        .replacen(&second_data, &compacted.media[1].reference(), 1);
    assert_eq!(String::from_utf8(compacted.compact_json).unwrap(), expected);
    for (media, expected_range) in compacted.media.iter().zip([&first_data, &second_data]) {
        let MediaStorage::Source { bytes, range } = &media.storage else {
            panic!("ASCII-safe nested media should retain the source range");
        };
        assert_eq!(bytes.as_ptr(), source_ptr);
        assert_eq!(&bytes[range.clone()], expected_range.as_bytes());
    }
    assert_eq!(compacted.media[0].decode().unwrap(), first_body);
    assert_eq!(compacted.media[1].decode().unwrap(), second_body);
}

proptest! {
#[test]
fn compaction_preserves_source_bytes_around_generated_data_uri(
    suffix in json_string_strategy(),
    payloads in prop::collection::vec(prop::collection::vec(any::<u8>(), MIN_EARLY_MEDIA_BYTES..MIN_EARLY_MEDIA_BYTES + 32), 3..5),
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
    let validated = validate(source.as_bytes().to_vec())
        .expect("generated nested JSON is valid");
    let compacted = validated.compact().expect("compact media");
    prop_assert_eq!(compacted.media.len(), uris.len());
    let mut expected = source;
    for (uri, media) in uris.iter().zip(&compacted.media) {
        prop_assert_eq!(media.original_value().unwrap(), uri.as_str());
        expected = expected.replacen(uri, &media.reference(), 1);
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
    let validated = validate(source.clone()).expect("valid JSON remains native");
    prop_assert_eq!(validated.source.as_slice(), source.as_slice());

    let compacted = validated.compact().expect("compact media");
    let compact: Value = serde_json::from_slice(&compacted.compact_json)
        .expect("compaction preserves valid JSON");
    if compacted.media.is_empty() {
        // With no candidates, compaction must preserve arbitrary valid JSON.
        prop_assert_eq!(compact, value);
    }
}

}
