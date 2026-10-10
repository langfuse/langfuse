//! Recognize provider media objects from the last value of each relevant field.
//!
//! The walk feeds completed fields to `ProviderFields::record`; on object close,
//! `structured_shape` selects the body token, MIME type, and provider kind.
//! Only field ranges and Gemini's inline-object summary are retained.

use std::borrow::Cow;
use std::ops::Range;

use super::json::decode_json_string;
use super::payload::MediaPayloadKind;

macro_rules! shape_keys {
    ($($variant:ident => $name:literal),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, Eq, PartialEq)]
        pub(super) enum ShapeKey {
            $($variant,)+
        }

        impl ShapeKey {
            const COUNT: usize = [$(Self::$variant),+].len();

            pub(super) fn from_name(name: &str) -> Option<Self> {
                match name {
                    $($name => Some(Self::$variant),)+
                    _ => None,
                }
            }

            fn index(self) -> usize {
                self as usize
            }
        }
    };
}

shape_keys! {
    Type => "type",
    Data => "data",
    MediaType => "media_type",
    MimeType => "mime_type",
    MimeTypeCamel => "mimeType",
    MediaTypeCamel => "mediaType",
    Content => "content",
    Image => "image",
    InlineData => "inline_data",
    InlineDataCamel => "inlineData",
}

#[derive(Clone, Debug)]
enum ShapeValue {
    String(Range<usize>),
    InlineObject {
        fields: Box<InlineFields>,
        range: Range<usize>,
    },
    Other(Range<usize>),
}

#[derive(Clone, Debug, Default)]
struct InlineFields {
    data: Option<ShapeValue>,
    mime_type: Option<ShapeValue>,
    mime_type_camel: Option<ShapeValue>,
}

impl InlineFields {
    fn from_provider(fields: &ProviderFields) -> Self {
        Self {
            data: fields.get(ShapeKey::Data).map(to_inline_value),
            mime_type: fields.get(ShapeKey::MimeType).map(to_inline_value),
            mime_type_camel: fields.get(ShapeKey::MimeTypeCamel).map(to_inline_value),
        }
    }
}

fn to_inline_value(value: &ShapeValue) -> ShapeValue {
    match value {
        ShapeValue::String(range) => ShapeValue::String(range.clone()),
        ShapeValue::InlineObject { range, .. } | ShapeValue::Other(range) => {
            ShapeValue::Other(range.clone())
        }
    }
}

#[derive(Clone, Debug, Default)]
pub(super) struct ProviderFields {
    values: [Option<ShapeValue>; ShapeKey::COUNT],
}

impl ProviderFields {
    pub(super) fn record(&mut self, key: ShapeKey, shape: ValueShape) {
        let value = match shape {
            ValueShape::String(range) => ShapeValue::String(range),
            ValueShape::Object { range, fields }
                if matches!(key, ShapeKey::InlineData | ShapeKey::InlineDataCamel) =>
            {
                match fields {
                    Some(fields) => ShapeValue::InlineObject {
                        fields: Box::new(InlineFields::from_provider(&fields)),
                        range,
                    },
                    None => ShapeValue::Other(range),
                }
            }
            ValueShape::Object { range, .. } | ValueShape::Other(range) => ShapeValue::Other(range),
        };
        self.values[key.index()] = Some(value);
    }

    fn get(&self, key: ShapeKey) -> Option<&ShapeValue> {
        self.values[key.index()].as_ref()
    }
}

pub(super) enum ValueShape {
    String(Range<usize>),
    Object {
        range: Range<usize>,
        fields: Option<Box<ProviderFields>>,
    },
    Other(Range<usize>),
}

pub(super) fn structured_shape(
    input: &[u8],
    fields: &ProviderFields,
) -> Option<StructuredCandidate> {
    let Some(type_name) = fields
        .get(ShapeKey::Type)
        .and_then(|value| field_string(input, value))
    else {
        return structured_gemini_shape(input, fields);
    };
    let provider = match type_name.as_ref() {
        "base64" => Some((
            ShapeKey::MediaType,
            fields.get(ShapeKey::Data),
            MediaPayloadKind::Anthropic,
        )),
        "media" => Some((
            ShapeKey::MimeType,
            fields.get(ShapeKey::Data),
            MediaPayloadKind::Vertex,
        )),
        "blob" => Some((
            ShapeKey::MimeType,
            fields.get(ShapeKey::Content),
            MediaPayloadKind::AiSdkV7,
        )),
        "file" => {
            let data = fields
                .get(ShapeKey::Data)
                .filter(|value| matches!(value, ShapeValue::String(_)))
                .or_else(|| fields.get(ShapeKey::Image));
            Some((ShapeKey::MediaTypeCamel, data, MediaPayloadKind::AiSdkV6))
        }
        _ => None,
    };
    if let Some((content_type_key, data_value, kind)) = provider {
        if let (Some(data_range), Some(content_type)) = (
            data_value.and_then(shape_string_range),
            fields
                .get(content_type_key)
                .and_then(|value| field_string(input, value)),
        ) {
            return Some(StructuredCandidate {
                token_range: data_range,
                content_type: content_type.into_owned(),
                kind,
            });
        }
    }
    structured_gemini_shape(input, fields)
}

fn structured_gemini_shape(input: &[u8], fields: &ProviderFields) -> Option<StructuredCandidate> {
    for inline_key in [ShapeKey::InlineData, ShapeKey::InlineDataCamel] {
        let Some(ShapeValue::InlineObject { fields: inline, .. }) = fields.get(inline_key) else {
            continue;
        };
        let Some(data_range) = inline.data.as_ref().and_then(shape_string_range) else {
            continue;
        };
        let snake_is_null = inline
            .mime_type
            .as_ref()
            .is_some_and(|value| value_starts_with_null(input, value));
        let selected_type = if inline.mime_type.is_some() && !snake_is_null {
            inline.mime_type.as_ref()
        } else {
            inline.mime_type_camel.as_ref()
        };
        let Some(content_type) = selected_type.and_then(|value| field_string(input, value)) else {
            continue;
        };
        return Some(StructuredCandidate {
            token_range: data_range,
            content_type: content_type.into_owned(),
            kind: MediaPayloadKind::Gemini,
        });
    }
    None
}

pub(super) struct StructuredCandidate {
    pub(super) token_range: Range<usize>,
    pub(super) content_type: String,
    pub(super) kind: MediaPayloadKind,
}

fn shape_string_range(value: &ShapeValue) -> Option<Range<usize>> {
    match value {
        ShapeValue::String(range) => Some(range.clone()),
        ShapeValue::InlineObject { .. } | ShapeValue::Other(_) => None,
    }
}

fn field_string<'a>(input: &'a [u8], value: &ShapeValue) -> Option<Cow<'a, str>> {
    match value {
        ShapeValue::String(range) => decode_json_string(input, range.clone()),
        ShapeValue::InlineObject { .. } | ShapeValue::Other(_) => None,
    }
}

fn value_starts_with_null(input: &[u8], value: &ShapeValue) -> bool {
    match value {
        ShapeValue::Other(range) => input
            .get(range.clone())
            .is_some_and(|bytes| bytes.starts_with(b"null")),
        ShapeValue::String(_) | ShapeValue::InlineObject { .. } => false,
    }
}
