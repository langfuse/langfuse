//! Lookup results in the flat form the worker's `encodeOtelLookups` writes.
//!
//! The worker appends every text field to one string in a fixed order, each followed by a line
//! feed, and records the length of each field in UTF-16 code units. Counts, flags and numeric
//! fields go to a second array in the order they are read here. Reading a JavaScript object
//! from Rust takes one call per property on Node's main thread; this form crosses in three
//! values, whatever the number of results.
//!
//! `decode` rebuilds, for each result, the object that `otel_enrichment::enrich` reads.

use crate::native_task::NativeResult;
use crate::otel::value::{Number, Object, Value};

use super::failure;

/// Written first by `encodeOtelLookups`. Both sides change together.
const FORMAT_VERSION: f64 = 1.0;

/// The flat form held in memory Rust owns, which is what `decode` reads.
///
/// Node hands the lengths and numbers over as typed arrays (`EncodedOtelLookups` in
/// `otel_pipeline.rs`). Their memory stays with JavaScript, which can still write to it,
/// and `decode` runs in a task off Node's main thread. `RustOtelBatch::complete` therefore
/// copies both arrays into this struct before the task starts.
pub(super) struct EncodedLookups {
    pub(super) text: String,
    pub(super) lengths: Vec<u32>,
    pub(super) numbers: Vec<f64>,
}

/// One lookup result per request, in request order.
pub(super) fn decode(encoded: &EncodedLookups) -> NativeResult<Vec<Value>> {
    let mut reader = Reader {
        text: &encoded.text,
        is_ascii: encoded.text.is_ascii(),
        lengths: encoded.lengths.iter(),
        numbers: encoded.numbers.iter(),
    };
    results(&mut reader).ok_or_else(|| failure("invalid OTEL lookup results"))
}

fn results(reader: &mut Reader<'_>) -> Option<Vec<Value>> {
    if reader.number()? != FORMAT_VERSION {
        return None;
    }
    let results = reader.list(result)?;
    reader.is_finished().then_some(results)
}

fn result(reader: &mut Reader<'_>) -> Option<Value> {
    let mut result = Object::new();
    if !reader.flag()? {
        // The worker could not resolve this request.
        result.insert("error".into(), reader.text()?.into());
        return Some(Value::Object(result));
    }
    let prompt_id = reader.text()?;
    if reader.flag()? {
        result.insert("promptId".into(), prompt_id.into());
    }
    let model_id = reader.text()?;
    let model = if reader.flag()? {
        let mut model = Object::new();
        model.insert("id".into(), model_id.into());
        Value::Object(model)
    } else {
        Value::Null
    };
    result.insert("model".into(), model);
    result.insert("pricingTiers".into(), Value::Array(reader.list(tier)?));
    let available = reader.list(|reader| skill(reader, false))?;
    result.insert("skillsAvailable".into(), Value::Array(available));
    let loaded = reader.list(|reader| skill(reader, true))?;
    result.insert("skillsResourceLoaded".into(), Value::Array(loaded));
    Some(Value::Object(result))
}

fn tier(reader: &mut Reader<'_>) -> Option<Value> {
    let mut tier = Object::new();
    tier.insert("id".into(), reader.text()?.into());
    tier.insert("name".into(), reader.text()?.into());
    tier.insert("isDefault".into(), Value::Bool(reader.flag()?));
    tier.insert("priority".into(), json_number(reader.number()?));
    // Conditions are stored as free-form JSON, so they travel as JSON text.
    let conditions = reader.text()?;
    if reader.flag()? {
        tier.insert("conditions".into(), Value::parse(conditions).ok()?);
    }
    let prices = reader.list(|reader| {
        let mut price = Object::new();
        price.insert("usageType".into(), reader.text()?.into());
        price.insert("price".into(), reader.text()?.into());
        Some(Value::Object(price))
    })?;
    tier.insert("prices".into(), Value::Array(prices));
    Some(Value::Object(tier))
}

fn skill(reader: &mut Reader<'_>, has_file_path: bool) -> Option<Value> {
    let mut skill = Object::new();
    let id = reader.text()?;
    if reader.flag()? {
        skill.insert("langfuseSkillId".into(), id.into());
    }
    let version = reader.number()?;
    if reader.flag()? {
        skill.insert("skillVersion".into(), json_number(version));
    }
    skill.insert("skillName".into(), reader.text()?.into());
    if has_file_path {
        skill.insert("filePath".into(), reader.text()?.into());
    }
    Some(Value::Object(skill))
}

/// The value JSON carries for a JavaScript number: an integer stays an integer and a
/// non-finite number becomes null.
fn json_number(value: f64) -> Value {
    if value.fract() == 0.0 && value.abs() < 9_007_199_254_740_992.0 {
        Value::from(value as i64)
    } else {
        Number::from_f64(value).map_or(Value::Null, Value::Number)
    }
}

struct Reader<'a> {
    /// The text fields not read yet.
    text: &'a str,
    is_ascii: bool,
    lengths: std::slice::Iter<'a, u32>,
    numbers: std::slice::Iter<'a, f64>,
}

impl<'a> Reader<'a> {
    /// The next text field.
    fn text(&mut self) -> Option<&'a str> {
        let units = *self.lengths.next()? as usize;
        let end = if self.is_ascii {
            units
        } else {
            // Lengths count UTF-16 code units; find where the same span ends in UTF-8.
            let mut left = units;
            let mut end = 0;
            for character in self.text.chars() {
                if left == 0 {
                    break;
                }
                left = left.checked_sub(character.len_utf16())?;
                end += character.len_utf8();
            }
            if left != 0 {
                return None;
            }
            end
        };
        let field = self.text.get(..end)?;
        self.text = self.text.get(end..)?.strip_prefix('\n')?;
        Some(field)
    }

    fn number(&mut self) -> Option<f64> {
        self.numbers.next().copied()
    }

    fn flag(&mut self) -> Option<bool> {
        let flag = self.number()?;
        (flag == 0.0 || flag == 1.0).then_some(flag == 1.0)
    }

    /// A counted list. Every item reads at least one text field or number, which bounds the
    /// count by what is left to read.
    fn list<T>(&mut self, mut item: impl FnMut(&mut Self) -> Option<T>) -> Option<Vec<T>> {
        let count = self.number()?;
        let left = self.lengths.len() + self.numbers.len();
        if !(count >= 0.0 && count.fract() == 0.0 && count <= left as f64) {
            return None;
        }
        (0..count as usize).map(|_| item(self)).collect()
    }

    fn is_finished(&self) -> bool {
        self.text.is_empty() && self.lengths.len() == 0 && self.numbers.len() == 0
    }
}
