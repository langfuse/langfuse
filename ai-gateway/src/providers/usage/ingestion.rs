//! A generation's usage in the shape Langfuse ingests it, and the units ingestion
//! parses from it. A port of the `UsageDetails` union in
//! `packages/shared/src/server/ingestion/types.ts` followed by the worker's
//! `getUsageUnits`, which adds a missing `total`.
use serde_json::{Map, Value};

use crate::spend::UsageCostType;

/// The usage uploaded as the generation's `usage_details`, tagged with the
/// ingestion schema it satisfies.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum UsageDetails {
    OpenAiCompletion(Map<String, Value>),
    OpenAiResponse(Map<String, Value>),
    /// Any other shape; ingestion keeps its integer counts.
    Raw(Map<String, Value>),
}

impl UsageDetails {
    pub(crate) fn to_json(&self) -> Value {
        let (Self::OpenAiCompletion(usage) | Self::OpenAiResponse(usage) | Self::Raw(usage)) = self;
        Value::Object(usage.clone())
    }

    /// The provided usage details ingestion parses, which `calculateModelUsageCosts`
    /// prices. Raw usage goes through the whole union, as ingestion receives it.
    pub(crate) fn provided_usage_details(&self) -> UsageCostType {
        match self {
            Self::OpenAiCompletion(usage) => openai_completion_usage(usage),
            Self::OpenAiResponse(usage) => openai_response_usage(usage),
            Self::Raw(usage) => openai_completion_usage(usage)
                .or_else(|| openai_response_usage(usage))
                .or_else(|| raw_usage_details(usage)),
        }
        .unwrap_or_default()
    }

    /// The units Langfuse prices: the provided usage details with a missing `total` added.
    pub(crate) fn usage_units(&self) -> UsageCostType {
        let mut usage = self.provided_usage_details();
        if !usage.is_empty() && !usage.contains_key("total") {
            let total = usage.values().sum();
            usage.insert("total".into(), total);
        }
        usage
    }
}

/// `z.number().int().nonnegative()`
fn count(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .filter(|number| number.is_finite() && number.fract() == 0.0 && *number >= 0.0)
}

fn raw_usage_details(value: &Map<String, Value>) -> Option<UsageCostType> {
    let result = extract_usage_counts(value);
    (!result.is_empty()).then_some(result)
}

fn extract_usage_counts(value: &Map<String, Value>) -> UsageCostType {
    let mut result = UsageCostType::new();
    for (key, field) in value {
        if let Some(units) = count(field) {
            result.insert(key.clone(), units);
        } else if let Value::String(text) = field
            && let Some(parsed) = parse_int(text).filter(|parsed| *parsed >= 0.0)
        {
            result.insert(key.clone(), parsed);
        }
    }
    split_anthropic_cache_creation(value.get("cache_creation"), &mut result);
    result
}

/// JavaScript `parseInt(text, 10)`: leading whitespace, an optional sign, then
/// as many digits as follow.
fn parse_int(text: &str) -> Option<f64> {
    let text = text.trim_start();
    let (negative, unsigned) = match text.as_bytes().first() {
        Some(b'-') => (true, &text[1..]),
        Some(b'+') => (false, &text[1..]),
        _ => (false, text),
    };
    let digits = unsigned
        .find(|character: char| !character.is_ascii_digit())
        .map_or(unsigned, |end| &unsigned[..end]);
    let parsed = digits.parse::<f64>().ok()?;
    // `-0` is not below zero, so it is kept as 0.
    Some(if negative { -parsed } else { parsed } + 0.0)
}

/// Native Anthropic usage nests cache writes by TTL under `cache_creation`.
/// The 5-minute and 1-hour writes are priced differently, so they are stored
/// as `input_cache_creation_5m` / `input_cache_creation_1h`; the aggregate
/// `cache_creation_input_tokens` keeps only the unattributed remainder so no
/// write is priced twice.
fn split_anthropic_cache_creation(cache_creation: Option<&Value>, result: &mut UsageCostType) {
    let Some(Value::Object(split)) = cache_creation else {
        return;
    };
    let five_minute = split.get("ephemeral_5m_input_tokens").and_then(count);
    let one_hour = split.get("ephemeral_1h_input_tokens").and_then(count);
    if five_minute.is_none() && one_hour.is_none() {
        return;
    }

    let mut attributed = 0.0;
    if let Some(five_minute) = five_minute {
        result.insert("input_cache_creation_5m".into(), five_minute);
        attributed += five_minute;
    }
    if let Some(one_hour) = one_hour {
        result.insert("input_cache_creation_1h".into(), one_hour);
        attributed += one_hour;
    }

    let remainder = result
        .get("cache_creation_input_tokens")
        .copied()
        .unwrap_or(0.0)
        - attributed;
    if remainder > 0.0 {
        result.insert("cache_creation_input_tokens".into(), remainder);
    } else {
        result.remove("cache_creation_input_tokens");
    }
}

/// `record(string, number.int.nonnegative.nullish).nullish()`: the non-null counts,
/// or `None` when the field fails the schema.
fn optional_details(value: Option<&Value>) -> Option<Vec<(&String, f64)>> {
    match value {
        None | Some(Value::Null) => Some(Vec::new()),
        Some(Value::Object(details)) => details
            .iter()
            .filter(|(_, units)| !units.is_null())
            .map(|(key, units)| Some((key, count(units)?)))
            .collect(),
        Some(_) => None,
    }
}

/// The Chat Completions and Responses schemas differ only in their field names.
fn openai_usage(
    fields: &Map<String, Value>,
    [input_key, output_key, total_key]: [&str; 3],
    [input_details_key, output_details_key]: [&str; 2],
) -> Option<UsageCostType> {
    let input_tokens = count(fields.get(input_key)?)?;
    let output_tokens = count(fields.get(output_key)?)?;
    let total_tokens = count(fields.get(total_key)?)?;
    let input_tokens_details = optional_details(fields.get(input_details_key))?;
    let output_tokens_details = optional_details(fields.get(output_details_key))?;

    let mut unknown_fields = fields.clone();
    for key in [
        input_key,
        output_key,
        total_key,
        input_details_key,
        output_details_key,
    ] {
        unknown_fields.remove(key);
    }
    let mut result = extract_usage_counts(&unknown_fields);
    let mut input = input_tokens;
    let mut output = output_tokens;

    for (key, units) in input_tokens_details {
        result.insert(format!("input_{key}"), units);
        input = (input - units).max(0.0);
    }

    for (key, units) in output_tokens_details {
        result.insert(format!("output_{key}"), units);
        output = (output - units).max(0.0);
    }

    result.insert("input".into(), input);
    result.insert("output".into(), output);
    result.insert("total".into(), total_tokens);
    Some(result)
}

fn openai_completion_usage(value: &Map<String, Value>) -> Option<UsageCostType> {
    openai_usage(
        value,
        ["prompt_tokens", "completion_tokens", "total_tokens"],
        ["prompt_tokens_details", "completion_tokens_details"],
    )
}

// The Responses API's usage departs from the Chat Completions schema.
fn openai_response_usage(value: &Map<String, Value>) -> Option<UsageCostType> {
    openai_usage(
        value,
        ["input_tokens", "output_tokens", "total_tokens"],
        ["input_tokens_details", "output_tokens_details"],
    )
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn units(value: Value) -> Vec<(String, f64)> {
        let Value::Object(usage) = value else {
            panic!("usage is an object")
        };
        UsageDetails::Raw(usage).usage_units().into_iter().collect()
    }

    fn expected(pairs: &[(&str, f64)]) -> Vec<(String, f64)> {
        let mut pairs: Vec<_> = pairs
            .iter()
            .map(|(key, units)| ((*key).to_owned(), *units))
            .collect();
        pairs.sort_by(|a, b| a.0.cmp(&b.0));
        pairs
    }

    #[test]
    fn completion_details_are_taken_out_of_their_parent_count() {
        let usage = json!({
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "total_tokens": 150,
            "prompt_tokens_details": { "cached_tokens": 40, "audio_tokens": null },
            "completion_tokens_details": { "reasoning_tokens": 60 },
        });
        assert_eq!(
            units(usage),
            expected(&[
                ("input", 60.0),
                ("input_cached_tokens", 40.0),
                ("output", 0.0),
                ("output_reasoning_tokens", 60.0),
                ("total", 150.0),
            ])
        );
    }

    #[test]
    fn anthropic_cache_writes_are_split_by_ttl_and_totalled() {
        let usage = json!({
            "input_tokens": 10,
            "output_tokens": 5,
            "cache_read_input_tokens": "7",
            "cache_creation_input_tokens": 30,
            "cache_creation": { "ephemeral_5m_input_tokens": 20, "ephemeral_1h_input_tokens": 10 },
            "service_tier": "standard",
            "server_tool_use": { "web_search_requests": 1 },
        });
        assert_eq!(
            units(usage),
            expected(&[
                ("input_tokens", 10.0),
                ("output_tokens", 5.0),
                ("cache_read_input_tokens", 7.0),
                ("input_cache_creation_5m", 20.0),
                ("input_cache_creation_1h", 10.0),
                ("total", 52.0),
            ])
        );
    }

    #[test]
    fn javascript_parse_int_semantics() {
        for (text, parsed) in [
            ("12", Some(12.0)),
            ("  12abc", Some(12.0)),
            ("+3", Some(3.0)),
            ("-0", Some(0.0)),
            ("-4", Some(-4.0)),
            ("abc", None),
            ("", None),
        ] {
            assert_eq!(parse_int(text), parsed, "{text:?}");
        }
    }
}
