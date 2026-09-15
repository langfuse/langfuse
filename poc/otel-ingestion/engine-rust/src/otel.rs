//! Serde model of the raw OTel export files, absorbing both real-world
//! encodings in one type each:
//!   - protobuf-decoded: ids as {"type":"Buffer","data":[...]}, 64-bit ints as
//!     protobufjs Longs {low, high, unsigned}
//!   - OTLP/JSON: ids as hex strings, 64-bit ints as decimal strings
//!
//! Leaf fields are lenient by construction: a wrong-typed value degrades to
//! the same empty/zero the SQL's NULL-propagating accessors produce, instead
//! of failing the file — one malformed span must not poison a whole batch.
//! (Envelope structure — the resourceSpans/scopeSpans/spans arrays — stays
//! strict; files broken at that level are dead-letter material.)

use serde::Deserialize;

/// A value that degrades to `T::default()` when the JSON token has the wrong
/// shape, instead of failing the file. This is the poison-pill guard: one
/// malformed attribute must not wedge a whole batch in retry-forever, and
/// the degraded result ('' / 0) is exactly what the SQL path's
/// NULL-propagating reads produce for the same input — which is what keeps
/// A↔B checksum parity.
///
/// Why this is hand-rolled and not `#[serde(untagged)]` with an IgnoredAny
/// catch-all (the obvious five-line version): untagged works by buffering
/// the entire value into serde's private Content tree and replaying it
/// against each variant, cloning whatever it accepts. A payload string here
/// crosses three nested Lenient layers (KeyValue → AnyValue → String), so a
/// 47 MB value was transiently copied ~5× — +248 MB peak while transforming
/// one 57 MB file, invisible to the worker's byte budget because it lives
/// inside serde. The visitor below keeps the same leniency while
/// materializing every accepted value exactly once: it decides from the
/// input token first and only then parses, so nothing is buffered for a
/// second look. (Measured effect: +248 → +105 MB on that file; the rest is
/// serde_json's own escaped-string scratch.)
pub struct Lenient<T>(T);

impl<T> Lenient<T> {
    pub fn into_inner(self) -> T {
        self.0
    }
}

impl<T: Default> Default for Lenient<T> {
    fn default() -> Self {
        Lenient(T::default())
    }
}

/// The one JSON shape `T` accepts; everything else defaults. Declaring the
/// shape per type is what makes the no-buffering visitor possible: untagged
/// must parse a value to discover which variant fits, but every Lenient
/// target here accepts exactly one shape, so the decision needs only the
/// next input token.
#[derive(PartialEq, Eq, Clone, Copy)]
pub enum Shape {
    Str,
    Map,
    F64,
    I64,
}

pub trait LenientShape {
    const SHAPE: Shape;
}

impl LenientShape for String {
    const SHAPE: Shape = Shape::Str;
}
impl LenientShape for f64 {
    const SHAPE: Shape = Shape::F64;
}
impl LenientShape for i64 {
    const SHAPE: Shape = Shape::I64;
}
impl LenientShape for KeyValue {
    const SHAPE: Shape = Shape::Map;
}
impl LenientShape for AnyValue {
    const SHAPE: Shape = Shape::Map;
}
impl LenientShape for Resource {
    const SHAPE: Shape = Shape::Map;
}
impl LenientShape for Scope {
    const SHAPE: Shape = Shape::Map;
}
impl LenientShape for Status {
    const SHAPE: Shape = Shape::Map;
}

impl<'de, T> Deserialize<'de> for Lenient<T>
where
    T: Deserialize<'de> + Default + LenientShape,
{
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        // deserialize_any: the deserializer looks at the next input token and
        // calls the matching visit_* arm — shape dispatch before any parsing
        deserializer.deserialize_any(LenientVisitor(std::marker::PhantomData))
    }
}

struct LenientVisitor<T>(std::marker::PhantomData<T>);

impl<'de, T> serde::de::Visitor<'de> for LenientVisitor<T>
where
    T: Deserialize<'de> + Default + LenientShape,
{
    type Value = Lenient<T>;

    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("any JSON value (wrong shapes degrade to the default)")
    }

    // escaped strings arrive borrowed from serde_json's scratch buffer; one
    // copy here — the same cost plain String deserialization pays
    fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<Self::Value, E> {
        use serde::de::IntoDeserializer;
        if T::SHAPE == Shape::Str {
            T::deserialize(v.into_deserializer()).map(Lenient)
        } else {
            Ok(Lenient::default())
        }
    }

    // an owned string handed over by the deserializer is moved: zero copies
    fn visit_string<E: serde::de::Error>(self, v: String) -> Result<Self::Value, E> {
        use serde::de::IntoDeserializer;
        if T::SHAPE == Shape::Str {
            T::deserialize(v.into_deserializer()).map(Lenient)
        } else {
            Ok(Lenient::default())
        }
    }

    fn visit_map<A: serde::de::MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        use serde::de::IgnoredAny;
        if T::SHAPE == Shape::Map {
            // stream the map straight into T's derived Deserialize, token by
            // token — the line that replaces untagged's Content buffering
            T::deserialize(serde::de::value::MapAccessDeserializer::new(map)).map(Lenient)
        } else {
            // wrong shape must still be consumed so the parser stays
            // positioned; IgnoredAny walks it without building anything
            while map.next_entry::<IgnoredAny, IgnoredAny>()?.is_some() {}
            Ok(Lenient::default())
        }
    }

    // no Lenient target is array-shaped: drain to keep the parser positioned
    fn visit_seq<A: serde::de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
        use serde::de::IgnoredAny;
        while seq.next_element::<IgnoredAny>()?.is_some() {}
        Ok(Lenient::default())
    }

    fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<Self::Value, E> {
        use serde::de::IntoDeserializer;
        match T::SHAPE {
            Shape::I64 => T::deserialize(v.into_deserializer()).map(Lenient),
            Shape::F64 => T::deserialize((v as f64).into_deserializer()).map(Lenient),
            _ => Ok(Lenient::default()),
        }
    }

    fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<Self::Value, E> {
        use serde::de::IntoDeserializer;
        match T::SHAPE {
            // matches the untagged behavior: > i64::MAX degrades to default
            Shape::I64 => match i64::try_from(v) {
                Ok(i) => T::deserialize(i.into_deserializer()).map(Lenient),
                Err(_) => Ok(Lenient::default()),
            },
            Shape::F64 => T::deserialize((v as f64).into_deserializer()).map(Lenient),
            _ => Ok(Lenient::default()),
        }
    }

    fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<Self::Value, E> {
        use serde::de::IntoDeserializer;
        match T::SHAPE {
            // floats do not read as ints, matching the SQL's `.:Int64`
            Shape::F64 => T::deserialize(v.into_deserializer()).map(Lenient),
            _ => Ok(Lenient::default()),
        }
    }

    fn visit_bool<E: serde::de::Error>(self, _: bool) -> Result<Self::Value, E> {
        Ok(Lenient::default())
    }

    fn visit_unit<E: serde::de::Error>(self) -> Result<Self::Value, E> {
        Ok(Lenient::default())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSpan {
    #[serde(default)]
    pub resource: Lenient<Resource>,
    #[serde(default)]
    pub scope_spans: Vec<ScopeSpan>,
}

#[derive(Deserialize, Default)]
pub struct Resource {
    #[serde(default)]
    pub attributes: Vec<Lenient<KeyValue>>,
}

#[derive(Deserialize)]
pub struct ScopeSpan {
    #[serde(default)]
    pub scope: Lenient<Scope>,
    #[serde(default)]
    pub spans: Vec<Span>,
}

#[derive(Deserialize, Default)]
pub struct Scope {
    #[serde(default)]
    pub name: Lenient<String>,
    #[serde(default)]
    pub version: Lenient<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    #[serde(default)]
    pub trace_id: Option<Id>,
    #[serde(default)]
    pub span_id: Option<Id>,
    #[serde(default)]
    pub parent_span_id: Option<Id>,
    #[serde(default)]
    pub name: Lenient<String>,
    // OTLP/JSON may encode enums as strings ("SPAN_KIND_SERVER"); like the
    // SQL's `.:Int64`, anything non-integer reads as 0
    #[serde(default)]
    pub kind: Lenient<i64>,
    #[serde(default)]
    pub start_time_unix_nano: Option<Int64Repr>,
    #[serde(default)]
    pub end_time_unix_nano: Option<Int64Repr>,
    #[serde(default)]
    pub attributes: Vec<Lenient<KeyValue>>,
    #[serde(default)]
    pub status: Lenient<Status>,
}

#[derive(Deserialize, Default)]
pub struct Status {
    #[serde(default)]
    pub message: Lenient<String>,
}

#[derive(Deserialize, Default)]
pub struct KeyValue {
    #[serde(default)]
    pub key: Lenient<String>,
    #[serde(default)]
    pub value: Lenient<AnyValue>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AnyValue {
    #[serde(default)]
    pub string_value: Lenient<String>,
    #[serde(default)]
    pub int_value: Option<Int64Repr>,
    #[serde(default)]
    pub double_value: Lenient<f64>,
}

/// Span/trace id: hex string, or protobufjs Buffer JSON. Anything else
/// (including a Buffer whose bytes are out of range) degrades to "".
#[derive(Deserialize)]
#[serde(untagged)]
pub enum Id {
    Hex(String),
    Buffer { data: Vec<u8> },
    Other(serde::de::IgnoredAny),
}

impl Id {
    pub fn into_hex(self) -> String {
        match self {
            Id::Hex(s) => s,
            Id::Buffer { data } => hex_lower(&data),
            Id::Other(_) => String::new(),
        }
    }
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 15) as usize] as char);
    }
    out
}

/// 64-bit integer in any transport encoding: decimal string, protobufjs Long
/// (signed int32 halves), or plain JSON number. `Other` absorbs anything else
/// so one malformed attribute cannot fail the whole file.
#[derive(Deserialize)]
#[serde(untagged)]
pub enum Int64Repr {
    Str(String),
    Long { low: i64, high: i64 },
    Num(i64),
    Other(serde::de::IgnoredAny),
}

impl Int64Repr {
    /// Attribute intValue lane (SQL: toInt64OrZero / Long math on Int64).
    pub fn as_i64(&self) -> i64 {
        match self {
            Int64Repr::Str(s) => s.parse().unwrap_or(0),
            Int64Repr::Long { low, high } => high.wrapping_shl(32).wrapping_add(low & 0xFFFF_FFFF),
            Int64Repr::Num(n) => *n,
            Int64Repr::Other(_) => 0,
        }
    }

    /// Timestamp lane (SQL: toUInt64OrZero / Long math on UInt64).
    pub fn as_u64(&self) -> u64 {
        match self {
            Int64Repr::Str(s) => s.parse().unwrap_or(0),
            Int64Repr::Long { low, high } => ((*high as u64) << 32) | (*low as u32 as u64),
            Int64Repr::Num(n) => (*n).max(0) as u64,
            Int64Repr::Other(_) => 0,
        }
    }
}

/// Parse a batch payload — a JSON array of resourceSpans — invoking `f` on
/// each element as soon as it is parsed and dropping it before the next one
/// is read. Streaming is what keeps peak memory at "raw bytes + one
/// resourceSpan" regardless of batch size; deserializing a plain
/// Vec<ResourceSpan> would materialize the whole model at once.
pub fn for_each_resource_span<F>(bytes: &[u8], f: F) -> serde_json::Result<()>
where
    F: FnMut(ResourceSpan),
{
    struct Each<F>(F);

    impl<'de, F: FnMut(ResourceSpan)> serde::de::DeserializeSeed<'de> for Each<F> {
        type Value = ();

        fn deserialize<D: serde::Deserializer<'de>>(self, deserializer: D) -> Result<(), D::Error> {
            deserializer.deserialize_seq(self)
        }
    }

    impl<'de, F: FnMut(ResourceSpan)> serde::de::Visitor<'de> for Each<F> {
        type Value = ();

        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("a JSON array of resourceSpans")
        }

        fn visit_seq<A: serde::de::SeqAccess<'de>>(mut self, mut seq: A) -> Result<(), A::Error> {
            while let Some(rs) = seq.next_element::<ResourceSpan>()? {
                (self.0)(rs);
            }
            Ok(())
        }
    }

    let mut de = serde_json::Deserializer::from_slice(bytes);
    serde::de::DeserializeSeed::deserialize(Each(f), &mut de)?;
    de.end()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_encodings_and_garbage() {
        let hex: Id = serde_json::from_str(r#""ab01cd""#).unwrap();
        assert_eq!(hex.into_hex(), "ab01cd");
        let buf: Id = serde_json::from_str(r#"{"type":"Buffer","data":[171,1,205]}"#).unwrap();
        assert_eq!(buf.into_hex(), "ab01cd");
        // numeric id and out-of-range Buffer byte degrade instead of erroring
        let num: Id = serde_json::from_str("12345").unwrap();
        assert_eq!(num.into_hex(), "");
        let bad: Id = serde_json::from_str(r#"{"type":"Buffer","data":[0,256]}"#).unwrap();
        assert_eq!(bad.into_hex(), "");
    }

    #[test]
    fn int64_all_encodings() {
        let s: Int64Repr = serde_json::from_str(r#""4096""#).unwrap();
        assert_eq!(s.as_i64(), 4096);
        assert_eq!(s.as_u64(), 4096);

        // negative low half: 0x1_FFFF_FFFB = 8589934587
        let l: Int64Repr = serde_json::from_str(r#"{"low":-5,"high":1,"unsigned":true}"#).unwrap();
        assert_eq!(l.as_u64(), (1u64 << 32) + 4294967291);
        assert_eq!(l.as_i64(), (1i64 << 32) + 4294967291);

        let n: Int64Repr = serde_json::from_str("200").unwrap();
        assert_eq!(n.as_i64(), 200);

        let junk: Int64Repr = serde_json::from_str("1.5").unwrap();
        assert_eq!(junk.as_i64(), 0);
    }

    #[test]
    fn lenient_degrades_wrong_types() {
        let s: Lenient<String> = serde_json::from_str("123").unwrap();
        assert_eq!(s.into_inner(), "");
        let k: Lenient<i64> = serde_json::from_str(r#""SPAN_KIND_SERVER""#).unwrap();
        assert_eq!(k.into_inner(), 0);
        // integer tokens still read as doubles (the top_p case)
        let d: Lenient<f64> = serde_json::from_str("1").unwrap();
        assert_eq!(d.into_inner(), 1.0);
        let d: Lenient<f64> = serde_json::from_str(r#""0.7""#).unwrap();
        assert_eq!(d.into_inner(), 0.0);
    }
}
