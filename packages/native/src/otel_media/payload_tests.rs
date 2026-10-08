use proptest::prelude::*;
use serde_json::Value;

use super::super::scanner::MIN_EARLY_MEDIA_BYTES;
use super::super::tests::{data_uri, json_string_strategy, json_value_strategy};
use super::super::validate;
use super::MediaStorage;

proptest! {
#[test]
fn compaction_preserves_source_bytes_around_generated_data_uri(
    suffix in json_string_strategy(),
    payloads in prop::collection::vec(prop::collection::vec(any::<u8>(), MIN_EARLY_MEDIA_BYTES..MIN_EARLY_MEDIA_BYTES + 32), 3..5),
    layers in 0usize..4,
) {
    let prefix_json = serde_json::to_string(&format!("café-雪{suffix}")).unwrap();
    let payloads = payloads.into_iter().enumerate().map(|(index, mut payload)| {
        payload.push(index as u8);
        payload
    }).collect::<Vec<_>>();
    let uris = payloads.iter().map(|payload| data_uri(payload)).collect::<Vec<_>>();

    // Exercise both multiple URI spans within one string and adjacent provider values.
    // Providers cover plain objects, one embedded document, and adjacent embedded documents.
    for provider in [false, true] {
        let originals = uris.iter().map(|uri| {
            if provider { uri.split_once(',').unwrap().1.to_owned() } else { uri.clone() }
        }).collect::<Vec<_>>();
        let media_json = if provider {
            originals.iter().enumerate().map(|(index, data)| {
                let fields = if index % 2 == 0 { r#""type":"media","mime_type":"image/png""# }
                    else { r#""type":"base64","media_type":"image/png""# };
                let object = format!(r#"{{{fields},"data":"{data}"}}"#);
                if layers > 1 { serde_json::to_string(&object).unwrap() } else { object }
            }).collect::<Vec<_>>().join(", ")
        } else {
            std::iter::once(format!("\"before {} / {} after\"", originals[0], originals[1]))
                .chain(originals[2..].iter().map(|uri| format!("\"{uri}\"")))
                .collect::<Vec<_>>().join(", ")
        };
        let mut source = format!(
            "{{\n  \"prefix\" : {prefix_json},\n  \"escaped_prefix\" : \"café\\/雪\\u2603\",\n  \"media\" : [{media_json}],\n  \"slash\" : \"left\\/right\",\n  \"number\" : 1.2300e+04\n}}"
        );
        let document_layers = if provider { usize::from(layers == 1) } else { layers };
        for layer in 0..document_layers {
            source = format!("{{ \n  \"layer{layer}\" : {}, \"number\" : 7.000e0 \n}}", serde_json::to_string(&source).unwrap());
        }
        let validated = validate(source.as_bytes().to_vec()).unwrap();
        prop_assert_eq!(validated.source.as_slice(), source.as_bytes());
        let source_ptr = validated.source.as_ptr();
        let compacted = validated.compact().unwrap();
        prop_assert_eq!(compacted.media.len(), originals.len(), "provider={}, layers={}", provider, layers);
        let mut expected = source;
        for ((original, body), media) in originals.iter().zip(&payloads).zip(&compacted.media) {
            prop_assert!(media.reference().starts_with("@@@langfuseMedia:type=image/png|id="));
            prop_assert_eq!(media.original_value().unwrap(), original.as_str());
            prop_assert_eq!(media.decode().unwrap(), body.as_slice());
            expected = expected.replacen(original, &media.reference(), 1);
            match &media.storage {
                MediaStorage::Source { bytes, range } => {
                    prop_assert_eq!(bytes.as_ptr(), source_ptr);
                    prop_assert_eq!(&bytes[range.clone()], original.as_bytes());
                }
                MediaStorage::Owned(_) => prop_assert!(false, "ASCII media should retain the original source allocation"),
            }
        }
        prop_assert_eq!(String::from_utf8(compacted.compact_json).unwrap(), expected);
    }

    // An escaped candidate instead owns decoded text, but must replace its exact source span.
    let (header, payload) = uris[0].split_once(',').unwrap();
    let escaped = format!("{header},\\u{:04x}{}", payload.as_bytes()[0], &payload[1..]);
    let source = format!("{{\n  \"image\" : \"{escaped}\"\n}}");
    let compacted = validate(source.as_bytes().to_vec()).unwrap().compact().unwrap();
    prop_assert_eq!(compacted.media.len(), 1);
    let media = &compacted.media[0];
    prop_assert_eq!(media.original_value().unwrap(), uris[0].as_str());
    prop_assert_eq!(media.decode().unwrap(), payloads[0].as_slice());
    prop_assert!(matches!(&media.storage, MediaStorage::Owned(_)));
    prop_assert_eq!(String::from_utf8(compacted.compact_json).unwrap(), source.replacen(&escaped, &media.reference(), 1));
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
