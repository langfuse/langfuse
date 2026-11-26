//! Share provider field declarations and recognize media in raw JSON.
//!
//! Both this raw-JSON adapter and `normalized_shapes` use the same declarations
//! to select provider bodies and MIME fields supported by TypeScript's `matchStructuredMedia`.
//!
//! A Data URI carries its own MIME type; raw base64 needs the surrounding fields:
//! ```text
//! "data:image/png;base64,..."                       scanner reads the URI alone
//! {"type":"base64","media_type":"image/png",       Anthropic shape supplies MIME
//!  "data":"..."}                                   and identifies the body field
//! ```
//! A random string of base64 is not enough to identify media. The walk collects
//! field ranges in `ProviderFields`; `structured_shape` selects the body and MIME
//! when the object closes, so field order and duplicate keys are resolved first.
//! `scanner` then validates and hashes that body's contents.

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

            pub(super) fn name(self) -> &'static str {
                match self {
                    $(Self::$variant => $name,)+
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

pub(super) struct DirectShape {
    pub(super) content_type: ShapeKey,
    /// First string wins, including an empty string; non-string values allow fallback.
    pub(super) body_fields: &'static [ShapeKey],
    pub(super) kind: MediaPayloadKind,
}

impl DirectShape {
    pub(super) fn for_type(type_name: &str) -> Option<Self> {
        use MediaPayloadKind::{AiSdkV6, AiSdkV7, Anthropic, Vertex};
        use ShapeKey::{Content, Data, Image, MediaType, MediaTypeCamel, MimeType};

        let (content_type, body_fields, kind): (_, &'static [ShapeKey], _) = match type_name {
            "base64" => (MediaType, &[Data], Anthropic),
            "media" => (MimeType, &[Data], Vertex),
            "blob" => (MimeType, &[Content], AiSdkV7),
            "file" => (MediaTypeCamel, &[Data, Image], AiSdkV6),
            _ => return None,
        };
        Some(Self {
            content_type,
            body_fields,
            kind,
        })
    }
}

pub(super) struct InlineShape {
    pub(super) containers: [ShapeKey; 2],
    pub(super) body: ShapeKey,
    pub(super) content_type: ShapeKey,
    /// Only missing or null MIME fields allow fallback; other invalid values block it.
    pub(super) fallback_content_type: ShapeKey,
    pub(super) kind: MediaPayloadKind,
}

pub(super) const GEMINI_SHAPE: InlineShape = InlineShape {
    containers: [ShapeKey::InlineData, ShapeKey::InlineDataCamel],
    body: ShapeKey::Data,
    content_type: ShapeKey::MimeType,
    fallback_content_type: ShapeKey::MimeTypeCamel,
    kind: MediaPayloadKind::Gemini,
};

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
    body: Option<ShapeValue>,
    content_type: Option<ShapeValue>,
    fallback_content_type: Option<ShapeValue>,
}

impl InlineFields {
    fn from_provider(fields: &ProviderFields) -> Self {
        Self {
            body: fields.get(GEMINI_SHAPE.body).map(to_inline_value),
            content_type: fields.get(GEMINI_SHAPE.content_type).map(to_inline_value),
            fallback_content_type: fields
                .get(GEMINI_SHAPE.fallback_content_type)
                .map(to_inline_value),
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
            ValueShape::Object { range, fields } if GEMINI_SHAPE.containers.contains(&key) => {
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
    let shape = fields
        .get(ShapeKey::Type)
        .and_then(|value| field_string(input, value))
        .and_then(|name| DirectShape::for_type(&name));
    if let Some(shape) = shape {
        let data_range = shape
            .body_fields
            .iter()
            .find_map(|key| fields.get(*key).and_then(shape_string_range));
        let content_type = fields
            .get(shape.content_type)
            .and_then(|value| field_string(input, value));
        if let (Some(token_range), Some(content_type)) = (data_range, content_type) {
            return Some(StructuredCandidate {
                token_range,
                content_type: content_type.into_owned(),
                kind: shape.kind,
            });
        }
    }
    structured_gemini_shape(input, fields)
}

fn structured_gemini_shape(input: &[u8], fields: &ProviderFields) -> Option<StructuredCandidate> {
    for inline_key in GEMINI_SHAPE.containers {
        let Some(ShapeValue::InlineObject { fields: inline, .. }) = fields.get(inline_key) else {
            continue;
        };
        let Some(data_range) = inline.body.as_ref().and_then(shape_string_range) else {
            continue;
        };
        let primary_is_null = inline
            .content_type
            .as_ref()
            .is_some_and(|value| value_starts_with_null(input, value));
        let selected_type = if inline.content_type.is_some() && !primary_is_null {
            inline.content_type.as_ref()
        } else {
            inline.fallback_content_type.as_ref()
        };
        let Some(content_type) = selected_type.and_then(|value| field_string(input, value)) else {
            continue;
        };
        return Some(StructuredCandidate {
            token_range: data_range,
            content_type: content_type.into_owned(),
            kind: GEMINI_SHAPE.kind,
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
