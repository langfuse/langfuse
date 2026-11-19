//! Apply the shared provider declarations to normalized Rust objects.
//!
//! For example, Anthropic's `type: "base64"` object uses `data` and `media_type`.
//! `structured_target` returns the body path, MIME type, and media kind;
//! `extract_normalized_media` validates and extracts that body. Data URIs carry
//! their own MIME type and can enter extraction directly.

use crate::otel::value::{Object, Value};

use super::payload::MediaPayloadKind;
use super::provider_shapes::{DirectShape, ShapeKey, GEMINI_SHAPE};

pub(crate) enum StructuredTarget<'a> {
    Direct {
        property: &'static str,
        content_type: &'a str,
        kind: MediaPayloadKind,
    },
    Nested {
        container: &'static str,
        property: &'static str,
        content_type: &'a str,
        kind: MediaPayloadKind,
    },
}

pub(crate) fn structured_target(object: &Object) -> Option<StructuredTarget<'_>> {
    let shape = object
        .get(ShapeKey::Type.name())
        .and_then(Value::as_str)
        .and_then(DirectShape::for_type);
    if let Some(shape) = shape {
        let property = shape
            .body_fields
            .iter()
            .map(|key| key.name())
            .find(|field| object.get(*field).is_some_and(Value::is_string));
        if let (Some(property), Some(content_type)) = (
            property,
            object
                .get(shape.content_type.name())
                .and_then(Value::as_str),
        ) {
            return Some(StructuredTarget::Direct {
                property,
                content_type,
                kind: shape.kind,
            });
        }
    }

    structured_gemini_target(object)
}

fn structured_gemini_target(object: &Object) -> Option<StructuredTarget<'_>> {
    for container in GEMINI_SHAPE.containers {
        let inline_name = container.name();
        let Some(inline) = object.get(inline_name).and_then(Value::as_object) else {
            continue;
        };
        let Some(content_type) = inline
            .get(GEMINI_SHAPE.content_type.name())
            .filter(|value| !value.is_null())
            .or_else(|| inline.get(GEMINI_SHAPE.fallback_content_type.name()))
            .and_then(Value::as_str)
        else {
            continue;
        };
        if inline
            .get(GEMINI_SHAPE.body.name())
            .is_some_and(Value::is_string)
        {
            return Some(StructuredTarget::Nested {
                container: inline_name,
                property: GEMINI_SHAPE.body.name(),
                content_type,
                kind: GEMINI_SHAPE.kind,
            });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use crate::otel::value::Value;
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    use crate::otel_media::extract_media;
    use crate::otel_media::payload::MediaPayloadKind;
    use crate::otel_media::scanner::MIN_EARLY_MEDIA_BYTES;
    use crate::otel_media::MediaReferenceCollector;

    use super::{structured_target, StructuredTarget};
    use crate::otel_media::structural_walk::{scan, Candidate};
    use crate::otel_media::WalkStats;
    use proptest::prelude::*;
    use serde_json::{json, Value as JsonValue};

    fn raw_selection(source: &str) -> Vec<(String, String, MediaPayloadKind)> {
        scan(source.as_bytes(), false, 0, &mut WalkStats::default())
            .expect("valid provider JSON")
            .filter_map(|candidate| match candidate {
                Candidate::Structured {
                    token_range,
                    content_type,
                    kind,
                } => Some((
                    serde_json::from_str(&source[token_range]).unwrap(),
                    content_type,
                    kind,
                )),
                _ => None,
            })
            .collect()
    }

    fn normalized_selection(source: &str) -> Vec<(String, String, MediaPayloadKind)> {
        let value = Value::from(serde_json::from_str::<JsonValue>(source).unwrap());
        let object = value.as_object().unwrap();
        structured_target(object)
            .map(|target| match target {
                StructuredTarget::Direct {
                    property,
                    content_type,
                    kind,
                } => (
                    object[property].as_str().unwrap().to_owned(),
                    content_type.to_owned(),
                    kind,
                ),
                StructuredTarget::Nested {
                    container,
                    property,
                    content_type,
                    kind,
                } => (
                    object[container].as_object().unwrap()[property]
                        .as_str()
                        .unwrap()
                        .to_owned(),
                    content_type.to_owned(),
                    kind,
                ),
            })
            .into_iter()
            .collect()
    }

    #[test]
    fn provider_selection_preserves_aliases_precedence_and_fallbacks() {
        use MediaPayloadKind::{AiSdkV6, AiSdkV7, Anthropic, Gemini, Vertex};

        let cases = [
            (
                r#"{"type":"base64","media_type":"image/png","data":"anthropic"}"#,
                Some(("anthropic", "image/png", Anthropic)),
            ),
            (
                r#"{"type":"media","mime_type":"image/png","data":"vertex"}"#,
                Some(("vertex", "image/png", Vertex)),
            ),
            (
                r#"{"type":"blob","mime_type":"image/png","content":"blob"}"#,
                Some(("blob", "image/png", AiSdkV7)),
            ),
            (
                r#"{"type":"file","mediaType":"image/png","data":"data","image":"image"}"#,
                Some(("data", "image/png", AiSdkV6)),
            ),
            (
                r#"{"type":"file","mediaType":"image/png","data":"","image":"image"}"#,
                Some(("", "image/png", AiSdkV6)),
            ),
            (
                r#"{"type":"file","mediaType":"image/png","data":null,"image":"image"}"#,
                Some(("image", "image/png", AiSdkV6)),
            ),
            (
                r#"{"type":"file","mediaType":"image/png","data":false,"image":"image"}"#,
                Some(("image", "image/png", AiSdkV6)),
            ),
            (
                r#"{"type":"file","mediaType":"image/png","image":"image"}"#,
                Some(("image", "image/png", AiSdkV6)),
            ),
            (r#"{"type":"file","mediaType":null,"data":"data"}"#, None),
            (
                r#"{"inline_data":{"mime_type":"image/png","mimeType":"audio/mpeg","data":"snake"},"inlineData":{"mimeType":"video/mp4","data":"camel"}}"#,
                Some(("snake", "image/png", Gemini)),
            ),
            (
                r#"{"inline_data":{"mime_type":null,"mimeType":"audio/mpeg","data":"snake"}}"#,
                Some(("snake", "audio/mpeg", Gemini)),
            ),
            (
                r#"{"inlineData":{"mimeType":"video/mp4","data":"camel"}}"#,
                Some(("camel", "video/mp4", Gemini)),
            ),
            (
                r#"{"inline_data":{"mime_type":"","mimeType":"audio/mpeg","data":"snake"}}"#,
                Some(("snake", "", Gemini)),
            ),
            (
                r#"{"inline_data":{"mime_type":false,"mimeType":"audio/mpeg","data":"snake"}}"#,
                None,
            ),
            (
                r#"{"inline_data":{"mime_type":false,"mimeType":"audio/mpeg","data":"snake"},"inlineData":{"mimeType":"video/mp4","data":"camel"}}"#,
                Some(("camel", "video/mp4", Gemini)),
            ),
            (
                r#"{"type":"base64","media_type":"image/png","data":"direct","inlineData":{"mimeType":"video/mp4","data":"camel"}}"#,
                Some(("direct", "image/png", Anthropic)),
            ),
            (
                r#"{"type":"base64","media_type":false,"data":"direct","inlineData":{"mimeType":"video/mp4","data":"camel"}}"#,
                Some(("camel", "video/mp4", Gemini)),
            ),
            (
                r#"{"type":null,"inlineData":{"mimeType":"video/mp4","data":"camel"}}"#,
                Some(("camel", "video/mp4", Gemini)),
            ),
            (
                r#"{"type":"unknown","inlineData":{"mimeType":"video/mp4","data":"camel"}}"#,
                Some(("camel", "video/mp4", Gemini)),
            ),
            (
                r#"{"type":"blob","type":"file","mediaType":"image/png","data":"old","d\u0061ta":"new","image":"fallback"}"#,
                Some(("new", "image/png", AiSdkV6)),
            ),
        ];
        for (source, expected) in cases {
            let expected: Vec<_> = expected
                .map(|(body, mime, kind)| (body.to_owned(), mime.to_owned(), kind))
                .into_iter()
                .collect();
            assert_eq!(raw_selection(source), expected, "raw: {source}");
            assert_eq!(
                normalized_selection(source),
                expected,
                "normalized: {source}"
            );
        }
    }

    fn optional_field() -> BoxedStrategy<Option<JsonValue>> {
        prop_oneof![
            Just(None),
            Just(Some(JsonValue::Null)),
            any::<bool>().prop_map(|v| Some(json!(v))),
            any::<i32>().prop_map(|v| Some(json!(v))),
            Just(Some(json!([]))),
            Just(Some(json!({}))),
            Just(Some(json!(""))),
            crate::otel_media::tests::json_string_strategy().prop_map(|v| Some(json!(v))),
            Just(Some(json!("image/png"))),
            Just(Some(json!("body"))),
        ]
        .boxed()
    }

    fn object_from_fields(names: &[&str], values: Vec<Option<JsonValue>>) -> JsonValue {
        JsonValue::Object(
            names
                .iter()
                .zip(values)
                .filter_map(|(name, value)| value.map(|v| ((*name).to_owned(), v)))
                .collect(),
        )
    }

    fn provider_object() -> impl Strategy<Value = JsonValue> {
        let inline = prop_oneof![
            optional_field(),
            prop::collection::vec(optional_field(), 3).prop_map(|values| Some(object_from_fields(
                &["data", "mime_type", "mimeType"],
                values
            ))),
        ];
        (
            prop_oneof![
                optional_field(),
                prop::sample::select(vec!["base64", "media", "blob", "file"])
                    .prop_map(|name| Some(json!(name))),
            ],
            prop::collection::vec(optional_field(), 6),
            inline.clone(),
            inline,
            any::<bool>(),
        )
            .prop_map(|(kind, mut fields, snake, camel, reverse)| {
                fields.insert(0, kind);
                fields.extend([snake, camel]);
                let object = object_from_fields(
                    &[
                        "type",
                        "data",
                        "image",
                        "content",
                        "media_type",
                        "mime_type",
                        "mediaType",
                        "inline_data",
                        "inlineData",
                    ],
                    fields,
                );
                if reverse {
                    JsonValue::Object(
                        object
                            .as_object()
                            .unwrap()
                            .iter()
                            .rev()
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .collect(),
                    )
                } else {
                    object
                }
            })
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(2048))]

        #[test]
        fn provider_selection_agrees_across_representations(object in provider_object()) {
            let source = object.to_string();
            prop_assert_eq!(raw_selection(&source), normalized_selection(&source));
        }
    }

    #[test]
    fn root_string_keeps_json_spelling_and_collects_all_references() {
        let payload = vec![b'x'; MIN_EARLY_MEDIA_BYTES];
        let provider_data = STANDARD.encode(&payload);
        let data_body = vec![b'y'; MIN_EARLY_MEDIA_BYTES];
        let data_uri = format!("data:image/png;base64,{}", STANDARD.encode(data_body));
        let provider_source = format!(
            "{{\"type\":\"base64\",\"media_type\":\"image/png\",\"data\":\"{provider_data}\"}}"
        );
        let provider_media = extract_media(provider_source.as_bytes())
            .expect("valid provider JSON")
            .media
            .into_iter()
            .next()
            .expect("provider media");
        assert_eq!(provider_media.kind, MediaPayloadKind::Anthropic);
        let data_uri_source = format!(r#"{{"sibling":"{data_uri}"}}"#);
        let data_uri_media = extract_media(data_uri_source.as_bytes())
            .expect("valid data URI JSON")
            .media
            .into_iter()
            .next()
            .expect("sibling data URI");
        assert_eq!(data_uri_media.kind, MediaPayloadKind::DataUri);
        let provider_reference = provider_media.reference();
        let data_uri_reference = data_uri_media.reference();
        let compacted_text = format!(
            "{{\n  \"type\" : \"base64\",\n  \"media_type\" : \"image/png\",\n  \"data\" : \"{provider_reference}\",\n  \"sibling\" : \"{data_uri_reference}\",\n  \"large\" : 9007199254740993.25,\n  \"ratio\" : 1.2300\n}}"
        );
        let root = Value::String(compacted_text.clone().into());
        let media = [provider_media, data_uri_media];
        let mut collector = MediaReferenceCollector::new(media.iter());

        assert_eq!(collector.collect(std::iter::once(&root)), &[0, 1]);
        assert_eq!(root.as_str(), Some(compacted_text.as_str()));
        assert!(root.as_str().unwrap().contains(&provider_reference));
        assert!(root.as_str().unwrap().contains("9007199254740993.25"));
        assert!(root.as_str().unwrap().contains("1.2300"));

        let mut too_deep = Value::String(data_uri_reference.clone().into());
        for _ in 0..32 {
            too_deep = Value::Array(vec![too_deep]);
        }
        assert_eq!(collector.collect(std::iter::once(&too_deep)), &[1]);
        let mut leaf = &too_deep;
        while let Value::Array(values) = leaf {
            leaf = &values[0];
        }
        assert_eq!(leaf.as_str(), Some(data_uri_reference.as_str()));

        let malformed_prefix =
            Value::String(format!("@@@langfuseMedia:unterminated {data_uri_reference}").into());
        assert_eq!(collector.collect(std::iter::once(&malformed_prefix)), &[1]);
    }
}
