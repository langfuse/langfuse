//! Scan normalized Rust `Value`s and replace recognized media with temporary references.
//!
//! This handles provider objects assembled from OTLP attributes and embedded JSON strings.
//! `MediaReferenceCollector` maps references in input, output, and metadata to media-record
//! indices for upload requests.

use std::collections::HashMap;

use crate::otel::value::{JsString, Object, Value};

use super::encoding::{is_python_bytes_literal, is_valid_base64_syntax};
use super::normalized_shapes::{structured_target, StructuredTarget};
use super::payload::{
    EarlyMediaError, ExtractedMedia, MediaEncoding, MediaOccurrenceIds, MediaPayloadKind,
    MediaSource,
};
use super::rules::{
    is_media_reference, is_supported_content_type, may_be_serialized_json,
    may_contain_serialized_media, DATA_URI_PREFIX,
};
use super::scanner::{find_data_uri_candidates, parse_data_uri};
use super::source_text::for_each_media_reference;
use super::{extract_media_at_depth, MAX_EMBEDDED_JSON_DEPTH, MAX_LEGACY_MEDIA_DEPTH};

/// Map temporary references found in values to indices in the media list supplied to `new`.
pub struct MediaReferenceCollector {
    registry: HashMap<String, usize>,
    eligible: Vec<usize>,
}

impl MediaReferenceCollector {
    pub fn new<'a, I>(media: I) -> Self
    where
        I: IntoIterator<Item = &'a ExtractedMedia>,
    {
        let registry = media
            .into_iter()
            .enumerate()
            .map(|(index, entry)| (entry.reference(), index))
            .collect();
        Self {
            registry,
            eligible: Vec::new(),
        }
    }

    /// Return media-list indices in traversal order. Each call clears and reuses the result buffer.
    pub fn collect<'a, I>(&mut self, values: I) -> &[usize]
    where
        I: IntoIterator<Item = &'a Value>,
    {
        self.eligible.clear();
        for value in values {
            Self::visit(&self.registry, value, &mut self.eligible);
        }
        &self.eligible
    }

    fn visit(registry: &HashMap<String, usize>, value: &Value, eligible: &mut Vec<usize>) {
        match value {
            Value::String(text) => Self::collect_text(registry, text.as_str(), eligible),
            Value::Array(values) => {
                for value in values {
                    Self::visit(registry, value, eligible);
                }
            }
            Value::Object(object) => {
                for value in object.values() {
                    Self::visit(registry, value, eligible);
                }
            }
            _ => {}
        }
    }

    fn collect_text(registry: &HashMap<String, usize>, text: &str, eligible: &mut Vec<usize>) {
        for_each_media_reference(text, |reference| {
            if let Some(index) = registry.get(reference) {
                eligible.push(*index);
                true
            } else {
                false
            }
        });
    }
}

pub fn extract_normalized_media(
    value: &mut Value,
    registry: &mut Vec<ExtractedMedia>,
) -> Result<(), EarlyMediaError> {
    let mut extractor = NormalizedExtractor {
        registry,
        ids: MediaOccurrenceIds::default(),
        extract_embedded: extract_media_at_depth,
    };
    extractor.visit(value, 0, 0)
}

struct NormalizedExtractor<'a, F> {
    registry: &'a mut Vec<ExtractedMedia>,
    ids: MediaOccurrenceIds,
    extract_embedded: F,
}

impl<F> NormalizedExtractor<'_, F>
where
    F: FnMut(
        &[u8],
        usize,
        usize,
        &mut MediaOccurrenceIds,
    ) -> Result<Option<super::EarlyMediaResult>, EarlyMediaError>,
{
    fn visit(
        &mut self,
        value: &mut Value,
        structural_depth: usize,
        embedded_depth: usize,
    ) -> Result<(), EarlyMediaError> {
        if structural_depth >= MAX_LEGACY_MEDIA_DEPTH {
            return Ok(());
        }
        match value {
            Value::String(text) => self.visit_string(text, embedded_depth),
            Value::Array(values) => {
                for value in values {
                    self.visit(value, structural_depth + 1, embedded_depth)?;
                }
                Ok(())
            }
            Value::Object(object) => self.visit_object(object, structural_depth, embedded_depth),
            _ => Ok(()),
        }
    }

    fn visit_object(
        &mut self,
        object: &mut Object,
        structural_depth: usize,
        embedded_depth: usize,
    ) -> Result<(), EarlyMediaError> {
        // A recognized provider object supplies one media body. Return after processing it so
        // sibling fields remain untouched.
        if let Some(target) = structured_target(object) {
            match target {
                StructuredTarget::Direct {
                    property,
                    content_type,
                    kind,
                } => {
                    let content_type = content_type.to_owned();
                    if let Some(Value::String(text)) = object.get_mut(property) {
                        self.extract_provider_text(text, &content_type, kind)?;
                    }
                }
                StructuredTarget::Nested {
                    container,
                    property,
                    content_type,
                    kind,
                } => {
                    let content_type = content_type.to_owned();
                    if let Some(Value::Object(nested)) = object.get_mut(container) {
                        if let Some(Value::String(text)) = nested.get_mut(property) {
                            self.extract_provider_text(text, &content_type, kind)?;
                        }
                    }
                }
            }
            return Ok(());
        }

        for value in object.values_mut() {
            self.visit(value, structural_depth + 1, embedded_depth)?;
        }
        Ok(())
    }

    fn visit_string(
        &mut self,
        text: &mut JsString,
        embedded_depth: usize,
    ) -> Result<(), EarlyMediaError> {
        let checkpoint = self.registry.len();
        if let Err(error) = self.scan_string(text, embedded_depth) {
            // Keep this string and discard its pending uploads if extraction fails.
            // Other fields can still be processed without retrying the ingestion batch.
            self.registry.truncate(checkpoint);
            report_extraction_error(&error);
        }
        Ok(())
    }

    fn scan_string(
        &mut self,
        text: &mut JsString,
        embedded_depth: usize,
    ) -> Result<(), EarlyMediaError> {
        if is_media_reference(text.as_str()) {
            return Ok(());
        }

        // Match the TS detector's order: retain literal URI spelling before JSON
        // parsing can decode its escapes or hide it in a key/provider sibling.
        let mut replacement = self.extract_data_uris(text)?;
        let source = replacement.as_ref().unwrap_or(text);
        if may_be_serialized_json(source.as_str())
            && source.as_utf8().is_some()
            && embedded_depth < MAX_EMBEDDED_JSON_DEPTH
            && (source.as_str().contains(DATA_URI_PREFIX)
                || source.as_str().contains("\\u")
                || may_contain_serialized_media(source.as_str()))
        {
            match (self.extract_embedded)(source.as_bytes(), embedded_depth + 1, 0, &mut self.ids) {
                Ok(Some(extracted)) => {
                    replacement = Some(extracted.compact_json.into());
                    self.registry.extend(extracted.media);
                }
                Ok(None) => {}
                Err(
                    EarlyMediaError::InvalidJson { .. } | EarlyMediaError::TrailingBytes { .. },
                ) => {
                    // Malformed JSON can still contain a usable URI in ordinary text.
                }
                Err(error) => return Err(error),
            }
        }
        if let Some(replacement) = replacement {
            *text = replacement;
        }
        Ok(())
    }

    fn extract_provider_text(
        &mut self,
        text: &mut JsString,
        content_type: &str,
        kind: MediaPayloadKind,
    ) -> Result<(), EarlyMediaError> {
        if text.as_utf8().is_none() {
            return Ok(());
        }

        let (content_type, kind, source, encoding) = if text.as_str().starts_with(DATA_URI_PREFIX) {
            let Some(candidate) = parse_data_uri(text.as_str(), 0) else {
                return Ok(());
            };
            let Some(uri_content_type) = candidate
                .valid
                .filter(|_| candidate.start == 0 && candidate.end == text.as_str().len())
            else {
                return Ok(());
            };
            (
                uri_content_type.to_owned(),
                MediaPayloadKind::DataUri,
                MediaSource::Base64DataUri,
                MediaEncoding::Base64DataUri,
            )
        } else {
            if !is_supported_content_type(content_type) {
                return Ok(());
            }
            let (encoding, valid) = provider_encoding(text.as_str());
            if !valid {
                return Ok(());
            }
            (content_type.to_owned(), kind, MediaSource::Bytes, encoding)
        };

        let media = ExtractedMedia::from_owned(
            text.as_bytes().to_vec(),
            &content_type,
            kind,
            source,
            encoding,
            &mut self.ids,
        );
        let media = match media {
            Ok(Some(media)) => media,
            Ok(None) => return Ok(()),
            Err(error) => {
                report_extraction_error(&error);
                return Ok(());
            }
        };
        *text = media.reference().into();
        self.registry.push(media);
        Ok(())
    }

    fn extract_data_uris(&mut self, text: &JsString) -> Result<Option<JsString>, EarlyMediaError> {
        let candidates = find_data_uri_candidates(text.as_str());
        if candidates.is_empty() {
            return Ok(None);
        }

        let mut replacements = Vec::with_capacity(candidates.len());
        for (range, content_type) in candidates {
            // Keep a Data URI containing a lone surrogate code unit inline; continue
            // scanning this string for other URIs.
            let Ok(encoded) = std::str::from_utf8(&text.as_bytes()[range.clone()]) else {
                continue;
            };
            let Some(media) = ExtractedMedia::from_owned(
                encoded.as_bytes().to_vec(),
                content_type,
                MediaPayloadKind::DataUri,
                MediaSource::Base64DataUri,
                MediaEncoding::Base64DataUri,
                &mut self.ids,
            )?
            else {
                continue;
            };
            let reference = media.reference();
            self.registry.push(media);
            replacements.push((range, reference));
        }

        if replacements.is_empty() {
            return Ok(None);
        }
        let mut output = JsString::with_capacity(text.len());
        let mut end = 0;
        for (range, replacement) in replacements {
            output.push_slice(text, end..range.start);
            output.push_str(&replacement);
            end = range.end;
        }
        output.push_slice(text, end..text.len());
        Ok(Some(output))
    }
}

fn report_extraction_error(error: &EarlyMediaError) {
    metrics::counter!("langfuse.native.otel_media.extraction_errors", "stage" => "normalized")
        .increment(1);
    tracing::warn!(%error, "media extraction failed; retaining original field text");
}

fn provider_encoding(value: &str) -> (MediaEncoding, bool) {
    if is_python_bytes_literal(value) {
        return (MediaEncoding::PythonBytesLiteral, true);
    }
    (
        MediaEncoding::Base64,
        is_valid_base64_syntax(value.as_bytes()),
    )
}

#[cfg(test)]
mod tests {
    use super::super::encoding::BASE64;
    use super::super::scanner::MIN_EARLY_MEDIA_BYTES;
    use super::*;
    use crate::otel::value::json;
    use base64::Engine;

    #[test]
    fn extracts_provider_media_and_preserves_sibling_fields() {
        let mut value = json!({
            "type": "base64",
            "media_type": "image/png",
            "data": BASE64.encode(b"provider"),
            "sibling": data_uri(b"sibling"),
        });
        let mut registry = Vec::new();

        extract_normalized_media(&mut value, &mut registry).expect("extract provider media");

        assert_eq!(registry.len(), 1);
        assert_eq!(registry[0].kind, MediaPayloadKind::Anthropic);
        assert_eq!(registry[0].decode().unwrap(), b"provider");
        assert!(value["data"]
            .as_str()
            .unwrap()
            .starts_with(super::super::rules::MEDIA_REFERENCE_PREFIX));
        assert_eq!(value["sibling"], Value::from(data_uri(b"sibling")));
    }

    #[test]
    fn extracts_data_uri_and_embedded_provider_media_from_owned_values() {
        let direct_body = vec![b'd'; MIN_EARLY_MEDIA_BYTES];
        let nested_body = vec![b'n'; MIN_EARLY_MEDIA_BYTES];
        let nested = format!(r#"{{"content":"{}","number":1.0}}"#, data_uri(&nested_body));
        let mut value = json!({
            "input": data_uri(&direct_body),
            "serialized": nested,
        });
        let mut registry = Vec::new();

        extract_normalized_media(&mut value, &mut registry).expect("extract normalized media");

        assert_eq!(registry.len(), 2);
        assert!(value["input"]
            .as_str()
            .unwrap()
            .starts_with(super::super::rules::MEDIA_REFERENCE_PREFIX));
        assert!(value["serialized"]
            .as_str()
            .unwrap()
            .contains("@@@langfuseMedia:type=image/png|id="));
        assert_eq!(registry[0].decode().unwrap(), direct_body);
        assert_eq!(registry[1].decode().unwrap(), nested_body);
    }

    #[test]
    fn repeated_media_keeps_distinct_occurrences_across_raw_and_embedded_strings() {
        let uri = data_uri(b"same content");
        let escaped = uri.replacen("data:", r"\u0064ata:", 1);
        let mut value = json!([
            format!("{uri} {uri}"),
            format!(r#"["{escaped}","{escaped}"]"#),
            uri
        ]);
        let mut registry = Vec::new();
        extract_normalized_media(&mut value, &mut registry).unwrap();
        assert_eq!(registry.len(), 5);
        super::super::validate_media_registry(&[], &registry).unwrap();
        let mut collector = MediaReferenceCollector::new(&registry);
        assert_eq!(collector.collect([&value]), &[0, 1, 2, 3, 4]);
    }

    #[test]
    fn extracts_small_inline_media_between_existing_references() {
        let first = "@@@langfuseMedia:type=image/png|id=first|source=bytes@@@";
        let last = "@@@langfuseMedia:type=image/png|id=last|source=bytes@@@";
        let uri = data_uri(b"tiny");
        let escaped = uri.replacen("data:", r"\u0064ata:", 1);
        for (source, inline) in [
            (format!("{first} caption {uri} {last}"), uri),
            (
                format!(r#"{{"text":"{first} caption {escaped} {last}"}}"#),
                escaped,
            ),
        ] {
            let mut value = Value::String(source.clone().into());
            let mut registry = Vec::new();
            extract_normalized_media(&mut value, &mut registry).unwrap();
            assert_eq!(registry.len(), 1);
            assert_eq!(registry[0].decode().unwrap(), b"tiny");
            assert_eq!(
                value.as_str().unwrap(),
                source.replace(&inline, &registry[0].reference()),
            );
        }
    }

    #[test]
    fn late_normalization_extracts_small_media_from_stringified_documents() {
        let uri = data_uri(b"tiny");
        let provider_data = BASE64.encode(b"small-provider");
        let mut value = Value::String(format!(
            r#"{{"uri":"{uri}","provider":{{"type":"file","mediaType":"image/png","data":"{provider_data}"}}}}"#
        ).into());
        let mut registry = Vec::new();

        extract_normalized_media(&mut value, &mut registry)
            .expect("extract small media from stringified JSON");

        assert_eq!(registry.len(), 2);
        let compacted = value.as_str().expect("stringified document stays a string");
        assert_eq!(compacted.matches("@@@langfuseMedia:").count(), 2);
        assert!(registry
            .iter()
            .any(|media| media.decode().unwrap() == b"tiny"));
        assert!(registry
            .iter()
            .any(|media| media.decode().unwrap() == b"small-provider"));
    }

    #[test]
    fn late_escaped_provider_media_decodes_and_restores_each_retained_layer() {
        let mut original = json!({
            "type": "file", "mediaType": "image/png", "data": r"b'\x80\x00\xFF'"
        })
        .to_string();
        for layers in 1..=MAX_EMBEDDED_JSON_DEPTH as u32 {
            let mut value = Value::String(original.clone().into());
            let mut registry = Vec::new();
            extract_normalized_media(&mut value, &mut registry).unwrap();
            assert_eq!(registry.len(), 1);
            let media = &registry[0];
            assert_eq!(media.decode().unwrap(), [0x80, 0x00, 0xff]);
            let restored = value.as_str().unwrap().replace(
                &media.reference(),
                &media.original_value_for_layers(Some(layers)).unwrap(),
            );
            assert_eq!(restored, original);
            original = serde_json::to_string(&original).unwrap();
        }
    }

    #[test]
    fn surrogate_text_survives_media_replacement() {
        let mut text = Value::parse(r#""\ud800 data:image/png;base64,aGk= \udfff""#).unwrap();
        let mut registry = Vec::new();
        extract_normalized_media(&mut text, &mut registry).unwrap();
        assert_eq!(registry.len(), 1);
        assert_eq!(registry[0].decode().unwrap(), b"hi");
        assert_eq!(
            text.to_json_string(),
            format!(r#""\ud800 {} \udfff""#, registry[0].reference())
        );

        let source = r#""data:image/png;name=\ud800;base64,aGk=""#;
        let mut text = Value::parse(source).unwrap();
        registry.clear();
        extract_normalized_media(&mut text, &mut registry).unwrap();
        assert!(registry.is_empty());
        assert_eq!(text.to_json_string(), source);
    }

    #[test]
    fn leaves_stringified_json_unchanged_when_no_media_is_extracted() {
        let original = r#"{"number":1.0,"value":"data:image/png;base64,not#base64"}"#;
        let mut value = Value::String(original.to_owned().into());
        let mut registry = Vec::new();

        extract_normalized_media(&mut value, &mut registry).expect("scan normalized media");

        assert!(registry.is_empty());
        assert_eq!(value, Value::String(original.to_owned().into()));
    }

    #[test]
    fn continues_direct_scan_when_embedded_json_has_an_undecodable_sibling() {
        let original = r#"{"value":"\ud800 data:image/png;base64,aGk="}"#;
        let mut value = Value::String(original.to_owned().into());
        let mut registry = Vec::new();

        extract_normalized_media(&mut value, &mut registry).expect("scan normalized media");

        assert_eq!(registry.len(), 1);
        assert!(value
            .as_str()
            .unwrap()
            .contains("@@@langfuseMedia:type=image/png|id="));
    }

    #[test]
    fn empty_embedded_documents_do_not_allocate_media_ids() {
        for original in [
            r#"{"prompt":"\u3053\u3093\u306b\u3061\u306f"}"#,
            r#"{"value":"data:application/x-not-supported;base64,aGk="}"#,
            r#"{"type":"file","mediaType":"image/png","data":"not base64!"}"#,
        ] {
            let mut registry = Vec::new();
            let mut value = Value::from(original);
            let mut extractor = NormalizedExtractor {
                registry: &mut registry,
                ids: MediaOccurrenceIds::default(),
                extract_embedded: extract_media_at_depth,
            };
            extractor.visit(&mut value, 0, 0).unwrap();
            assert_eq!(extractor.ids, MediaOccurrenceIds::default(), "{original}");
            assert!(registry.is_empty());
            assert_eq!(value, Value::from(original));
        }
    }

    #[test]
    fn reports_internal_embedded_failures_without_changing_the_string() {
        use crate::otel::metadata::tests::CapturingRecorder;
        use std::sync::atomic::Ordering;

        for error in [
            EarlyMediaError::RandomnessUnavailable,
            EarlyMediaError::InvalidEditPlan { entry: 0 },
        ] {
            let original = r#"{"image":"data:image/png;base64,aGk=","type":"file","mediaType":"image/png","data":"b2s="}"#;
            let uri = "data:image/png;base64,aGk=";
            let mut value = json!([uri, original, uri]);
            let mut registry = Vec::new();
            let recorder = CapturingRecorder::default();
            metrics::with_local_recorder(&recorder, || {
                let mut extractor = NormalizedExtractor {
                    registry: &mut registry,
                    ids: MediaOccurrenceIds::default(),
                    extract_embedded: |_: &[u8], _, _, _: &mut MediaOccurrenceIds| {
                        Err(error.clone())
                    },
                };
                extractor.visit(&mut value, 0, 0).unwrap();
            });
            assert_eq!(value[1], Value::from(original));
            assert_eq!(registry.len(), 2);
            assert_eq!(value[0], Value::from(registry[0].reference()));
            assert_eq!(value[2], Value::from(registry[1].reference()));
            let recorded = recorder.0.into_inner().unwrap();
            assert_eq!(recorded.len(), 1);
            assert_eq!(
                recorded[0].0.name(),
                "langfuse.native.otel_media.extraction_errors"
            );
            assert_eq!(recorded[0].1.load(Ordering::Relaxed), 1);
        }
    }

    #[test]
    fn residual_data_uris_restore_verbatim_with_other_media_and_json_layers() {
        for header in [r"name=\u00e9", r"name=\\path", r"name=\ud800"] {
            for sibling in ["", r#", "other":"data:image/png;base64,b2s= ""#] {
                let mut original = format!(
                    r#"{{"value":"\ud800 data:image/png;{header};base64,aGk= "{sibling}}}"#
                );
                for _ in 0..3 {
                    let mut value = Value::from(original.clone());
                    let mut registry = Vec::new();
                    extract_normalized_media(&mut value, &mut registry).unwrap();
                    assert_eq!(
                        registry.len(),
                        if sibling.is_empty() { 1 } else { 2 },
                        "{original}"
                    );
                    let Value::String(text) = &mut value else {
                        unreachable!()
                    };
                    super::super::source_text::rewrite_known_references(
                        text,
                        |reference| registry.iter().any(|media| media.reference() == reference),
                        |_| true,
                        |reference, depth| {
                            registry
                                .iter()
                                .find(|media| media.reference() == reference)
                                .unwrap()
                                .original_value_for_layers(Some(depth))
                        },
                    )
                    .unwrap();
                    assert_eq!(text.as_str(), original);
                    assert_eq!(registry[0].decode().unwrap().len(), 2);
                    original = serde_json::to_string(&original).unwrap();
                }
            }
        }
    }

    #[test]
    fn extracts_unicode_escaped_data_uri_markers_in_embedded_json() {
        let original = r#"{"image":"\u0064ata:image/png;base64,aGk="}"#;
        let mut value = Value::String(original.to_owned().into());
        let mut registry = Vec::new();

        extract_normalized_media(&mut value, &mut registry).expect("scan normalized media");

        assert_eq!(registry.len(), 1);
        assert!(value
            .as_str()
            .unwrap()
            .contains("@@@langfuseMedia:type=image/png|id="));
    }

    #[test]
    fn uses_data_uri_metadata_inside_provider_values() {
        let data_uri = data_uri(b"provider-uri");
        let mut value = json!({
            "type": "file",
            "mediaType": "image/jpeg",
            "data": data_uri,
        });
        let mut registry = Vec::new();

        extract_normalized_media(&mut value, &mut registry).expect("extract provider URI");

        assert_eq!(registry.len(), 1);
        assert_eq!(registry[0].kind, MediaPayloadKind::DataUri);
        assert_eq!(registry[0].metadata.content_type, "image/png");
        assert_eq!(registry[0].metadata.source, MediaSource::Base64DataUri);
    }

    #[test]
    fn falls_back_to_camel_case_gemini_mime_when_snake_case_is_null() {
        let mut value = json!({
            "inline_data": {
                "mime_type": null,
                "mimeType": "image/png",
                "data": BASE64.encode(b"gemini"),
            },
        });
        let mut registry = Vec::new();

        extract_normalized_media(&mut value, &mut registry).expect("extract Gemini media");

        assert_eq!(registry.len(), 1);
        assert_eq!(registry[0].kind, MediaPayloadKind::Gemini);
        assert_eq!(registry[0].decode().unwrap(), b"gemini");
    }

    #[test]
    fn scans_data_uris_in_malformed_json_looking_text() {
        let original = r#"{"broken":data:image/png;base64,aGk=}"#;
        let mut value = Value::String(original.to_owned().into());
        let mut registry = Vec::new();

        extract_normalized_media(&mut value, &mut registry).expect("scan normalized media");

        assert_eq!(registry.len(), 1);
        assert!(value
            .as_str()
            .unwrap()
            .contains("@@@langfuseMedia:type=image/png|id="));
    }

    fn data_uri(value: &[u8]) -> String {
        format!("data:image/png;base64,{}", BASE64.encode(value))
    }
}
