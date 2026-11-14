//! Calculate usage totals and costs after OTLP normalization and the worker's
//! model, pricing-tier, prompt and skill lookups. `enrich` borrows the event and
//! lookup results, then returns the calculated fields and resolved IDs in an
//! `EnrichmentResult`. The caller moves the event and result into
//! `OwnedEvent::into_storage` to fill the row's storage fields.
//!
//! Submitted costs override calculated costs. The batch loop passes one
//! `PricingRegexCache` to every event, then releases it when the batch finishes.

use std::collections::{BTreeMap, HashMap};
use std::str::FromStr;

use crate::otel::attributes::{javascript_number_to_string, javascript_string};
use crate::otel::types::{EnrichmentResult, OwnedEvent};
use crate::otel::value::{Number, Value};
use indexmap::IndexMap;
use regress::{Flags, Regex};
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;

/// Compile each (pattern, case-sensitivity) pair once per batch, including failures.
/// Reusing these results keeps compilation work independent of the batch's event count.
#[derive(Default)]
pub struct PricingRegexCache(HashMap<(String, bool), Option<Regex>>);

/// Normalize usage and select a pricing tier, then use submitted costs or calculate
/// costs from that tier. Tier selection also runs when costs were submitted.
pub fn enrich(
    event: &OwnedEvent,
    lookup: &Value,
    regexes: &mut PricingRegexCache,
) -> EnrichmentResult {
    let model = lookup.get("model").filter(|value| value.is_object());
    let usage = add_usage_total(normalize_usage(&event.provided_usage_details));
    let has_provided_costs = has_provided_costs(event);

    // A failed generation can have a model but no token usage; its tier must stay unset.
    let tier = if usage.is_empty() {
        None
    } else {
        select_tier(lookup.get("pricingTiers"), &usage, event, regexes)
    };

    let cost_details = if has_provided_costs {
        provided_costs(&event.provided_cost_details)
    } else {
        compute_costs(&usage, tier)
    };

    EnrichmentResult {
        prompt_id: lookup
            .get("promptId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        model_id: model
            .and_then(|value| value.get("id"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        usage_details: usage,
        cost_details,
        usage_pricing_tier_id: tier
            .and_then(|value| value.get("id"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        usage_pricing_tier_name: tier
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        skills_available: lookup
            .get("skillsAvailable")
            .and_then(Value::as_array)
            .map(|skills| skills.iter().filter_map(parse_skill_reference).collect())
            .unwrap_or_default(),
        skills_resource_loaded: lookup
            .get("skillsResourceLoaded")
            .and_then(Value::as_array)
            .map(|skills| {
                skills
                    .iter()
                    .filter_map(parse_skill_resource_loaded)
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn parse_skill_reference(value: &Value) -> Option<crate::native_codec::SkillReference> {
    Some(crate::native_codec::SkillReference {
        langfuse_skill_id: value
            .get("langfuseSkillId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        skill_version: skill_version(value.get("skillVersion"))?,
        skill_name: value.get("skillName")?.as_str()?.to_owned(),
    })
}

fn parse_skill_resource_loaded(value: &Value) -> Option<crate::native_codec::SkillResourceLoaded> {
    Some(crate::native_codec::SkillResourceLoaded {
        langfuse_skill_id: value
            .get("langfuseSkillId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        skill_version: skill_version(value.get("skillVersion"))?,
        skill_name: value.get("skillName")?.as_str()?.to_owned(),
        file_path: value.get("filePath")?.as_str()?.to_owned(),
    })
}

fn skill_version(value: Option<&Value>) -> Option<Option<u32>> {
    match value {
        None | Some(Value::Null) => Some(None),
        Some(Value::Number(number)) => Some(Some(u32::try_from(number.as_u64()?).ok()?)),
        _ => None,
    }
}

fn has_provided_costs(event: &OwnedEvent) -> bool {
    event
        .provided_cost_details
        .values()
        .any(|value| !value.is_null())
}

/// Convert usage to finite, non-negative numbers before tier matching. Numeric strings
/// such as "100" become 100, following TypeScript's `normalizeProvidedUsageDetails`.
fn normalize_usage(values: &IndexMap<String, Value>) -> IndexMap<String, Value> {
    values
        .iter()
        .filter_map(|(key, value)| {
            let number = number(value).filter(|number| number.is_finite() && *number >= 0.0)?;
            Some((key.clone(), number_value(number)))
        })
        .collect()
}

fn add_usage_total(mut usage: IndexMap<String, Value>) -> IndexMap<String, Value> {
    if let Some(provided_total) = usage.get("total").and_then(number) {
        let bucket_sum = usage
            .iter()
            .filter(|(key, _)| key.as_str() != "total")
            .filter_map(|(_, value)| number(value))
            .sum::<f64>();
        // Signal possible double-counting, e.g. input already includes cached tokens.
        // Keep the reported counts; differences above max(1 token, 1% of total) emit a metric.
        if bucket_sum > provided_total + (provided_total * 0.01).max(1.0) {
            metrics::counter!("langfuse.ingestion.usage_details.total_mismatch", "write_path" => "events").increment(1);
        }
    } else if !usage.is_empty() {
        let total = usage.values().filter_map(number).sum::<f64>();
        usage.insert("total".to_owned(), number_value(total));
    }
    usage
}

/// Keep submitted costs as reported. Following TypeScript's supplied-cost rule,
/// add `total = input + output` only when `total` is absent and every non-null cost
/// entry is named `input` or `output`.
fn provided_costs(values: &BTreeMap<String, Value>) -> BTreeMap<String, Value> {
    let provided_keys = values
        .iter()
        .filter(|(_, value)| !value.is_null())
        .map(|(key, _)| key.as_str())
        .collect::<Vec<_>>();
    let final_total = values
        .get("total")
        .filter(|value| !value.is_null())
        .cloned()
        .or_else(|| {
            provided_keys
                .iter()
                .all(|key| matches!(*key, "input" | "output"))
                .then(|| javascript_add(values.get("input"), values.get("output")))
        });

    let mut costs = values.clone();
    if !costs.contains_key("total") {
        if let Some(total) = final_total {
            costs.insert("total".to_owned(), total);
        }
    }
    costs
}

/// Reproduce `(input ?? 0) + (output ?? 0)` from TypeScript ingestion.
/// For example, numeric 1.25 plus string "0.75" produces "1.250.75". Preserve that
/// result here; the storage converter validates it as a cost before writing the row.
fn javascript_add(left: Option<&Value>, right: Option<&Value>) -> Value {
    let zero = Value::from(0);
    let left = left.filter(|value| !value.is_null()).unwrap_or(&zero);
    let right = right.filter(|value| !value.is_null()).unwrap_or(&zero);
    if matches!(left, Value::String(_) | Value::Array(_) | Value::Object(_))
        || matches!(right, Value::String(_) | Value::Array(_) | Value::Object(_))
    {
        return Value::String(
            format!("{}{}", javascript_string(left), javascript_string(right)).into(),
        );
    }

    let total = javascript_number(left) + javascript_number(right);
    number_value(total)
}

fn javascript_number(value: &Value) -> f64 {
    match value {
        Value::Bool(value) => u8::from(*value) as f64,
        Value::Number(value) => value.as_f64().unwrap_or(f64::NAN),
        Value::Null => 0.0,
        _ => f64::NAN,
    }
}

fn number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(value) => value.as_f64(),
        Value::String(value) if value.as_str().trim().is_empty() => Some(0.0),
        Value::String(value) => value.as_str().parse().ok(),
        Value::Bool(value) => Some(if *value { 1.0 } else { 0.0 }),
        _ => None,
    }
}

fn number_value(value: f64) -> Value {
    if value.is_finite() && value.fract() == 0.0 && value >= 0.0 {
        if let Ok(integer) = u64::try_from(value as u128) {
            return Value::Number(Number::from(integer));
        }
    }
    Number::from_f64(value).map_or(Value::Null, Value::Number)
}

fn select_tier<'a>(
    tiers: Option<&'a Value>,
    usage: &IndexMap<String, Value>,
    event: &OwnedEvent,
    regexes: &mut PricingRegexCache,
) -> Option<&'a Value> {
    let tiers = tiers?.as_array()?;
    let mut conditioned = tiers
        .iter()
        .filter(|tier| tier.get("isDefault") != Some(&Value::Bool(true)))
        .collect::<Vec<_>>();
    conditioned.sort_by(|left, right| {
        let left = left.get("priority").and_then(Value::as_f64).unwrap_or(0.0);
        let right = right.get("priority").and_then(Value::as_f64).unwrap_or(0.0);
        left.partial_cmp(&right)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    conditioned
        .into_iter()
        .find(|tier| {
            tier.get("conditions")
                .and_then(Value::as_array)
                .is_some_and(|conditions| {
                    !conditions.is_empty()
                        && conditions
                            .iter()
                            .all(|condition| matches_condition(condition, usage, event, regexes))
                })
        })
        .or_else(|| {
            tiers
                .iter()
                .find(|tier| tier.get("isDefault") == Some(&Value::Bool(true)))
        })
}

fn matches_condition(
    condition: &Value,
    usage: &IndexMap<String, Value>,
    event: &OwnedEvent,
    regexes: &mut PricingRegexCache,
) -> bool {
    match condition.get("source").and_then(Value::as_str) {
        Some(source) => matches_attribute_condition(condition, source, event),
        None => matches_usage_condition(condition, usage, regexes),
    }
}

fn matches_attribute_condition(condition: &Value, source: &str, event: &OwnedEvent) -> bool {
    let Some(key) = condition.get("key").and_then(Value::as_str) else {
        return false;
    };
    let attributes = if source == "model_parameters" {
        pricing_attributes(event.model_parameters.as_ref())
    } else {
        pricing_object_attributes(&event.metadata)
    };
    let Some(attribute_value) = attributes.get(key) else {
        return false;
    };
    condition
        .get("values")
        .and_then(Value::as_array)
        .is_some_and(|values| {
            values
                .iter()
                .any(|value| value.as_str() == Some(attribute_value))
        })
}

fn matches_usage_condition(
    condition: &Value,
    usage: &IndexMap<String, Value>,
    regexes: &mut PricingRegexCache,
) -> bool {
    let Some(pattern) = condition.get("usageDetailPattern").and_then(Value::as_str) else {
        return false;
    };
    let case_sensitive = condition.get("caseSensitive") == Some(&Value::Bool(true));
    let Some(regex) = regexes
        .0
        .entry((pattern.to_owned(), case_sensitive))
        .or_insert_with(|| {
            Regex::from_unicode(
                pattern.encode_utf16().map(u32::from),
                Flags {
                    icase: !case_sensitive,
                    ..Flags::default()
                },
            )
            .ok()
        })
    else {
        return false;
    };
    let mut total = 0.0;
    for (key, value) in usage {
        // Matching keys such as "😀" with JavaScript semantics requires the library's
        // UTF-16 API, which has no execution limit. Skip those keys to keep backtracking bounded.
        // Other keys still participate: {"input": 100, "😀": 50} matches ^input$ > 10.
        // Stored usage counts stay unchanged.
        if key.chars().any(|character| character.len_utf16() == 2) {
            continue;
        }
        // Cap backtracking to limit the CPU spent matching each usage key.
        // Exhausting the budget rejects this condition; tier selection tries the next/default tier.
        let mut steps = 0;
        let Ok(found) = regex.find_from_interruptible(key, 0, || {
            steps += regress::INTERRUPT_INTERVAL;
            steps >= 1_000_000
        }) else {
            return false;
        };
        if found.is_some() {
            total += number(value).unwrap_or(0.0);
        }
    }
    let Some(expected) = condition.get("value").and_then(Value::as_f64) else {
        return false;
    };
    match condition.get("operator").and_then(Value::as_str) {
        Some("gt") => total > expected,
        Some("gte") => total >= expected,
        Some("lt") => total < expected,
        Some("lte") => total <= expected,
        Some("eq") => total == expected,
        Some("neq") => total != expected,
        _ => false,
    }
}

/// Pricing conditions compare top-level strings, numbers and booleans as text:
/// `{"temperature": 0.2}` becomes `{"temperature": "0.2"}`. Model parameters can
/// arrive as JSON text, so parse that representation before reading its fields.
fn pricing_attributes(value: Option<&Value>) -> BTreeMap<String, String> {
    let Some(value) = value else {
        return BTreeMap::new();
    };
    let parsed;
    let value = if let Value::String(value) = value {
        let Ok(value) = crate::otel::value::parse_js_string(value) else {
            return BTreeMap::new();
        };
        parsed = value;
        &parsed
    } else {
        value
    };
    let Some(object) = value.as_object() else {
        return BTreeMap::new();
    };
    pricing_object_attributes(object)
}

fn pricing_object_attributes(object: &crate::otel::value::Object) -> BTreeMap<String, String> {
    object
        .iter()
        .filter_map(|(key, value)| match value {
            Value::String(value) => Some((key.as_str().to_owned(), value.as_str().to_owned())),
            Value::Number(value) => {
                Some((key.as_str().to_owned(), javascript_number_to_string(value)))
            }
            Value::Bool(value) => Some((key.as_str().to_owned(), value.to_string())),
            _ => None,
        })
        .collect()
}

fn compute_costs(usage: &IndexMap<String, Value>, tier: Option<&Value>) -> BTreeMap<String, Value> {
    let mut costs = BTreeMap::new();
    let mut total = 0.0;
    let Some(prices) = tier
        .and_then(|tier| tier.get("prices"))
        .and_then(Value::as_array)
    else {
        return costs;
    };
    let price_for = |key: &str| {
        prices
            .iter()
            .find(|price| price.get("usageType").and_then(Value::as_str) == Some(key))
    };

    for (key, value) in usage {
        let price = price_for(key).or_else(|| {
            if matches!(
                key.as_str(),
                "input_cache_creation_5m" | "input_cache_creation_1h"
            ) {
                price_for("cache_creation_input_tokens")
                    .or_else(|| price_for("input_cache_creation"))
            } else {
                None
            }
        });
        let Some(price) = price
            .and_then(|price| price.get("price"))
            .and_then(|price| price.as_str())
        else {
            continue;
        };
        let Some(units) = number(value) else { continue };
        let (Ok(price), Ok(units)) = (
            Decimal::from_str(price),
            Decimal::from_str(&units.to_string()),
        ) else {
            continue;
        };
        let Some(cost) = price.checked_mul(units).and_then(|cost| cost.to_f64()) else {
            continue;
        };
        if cost.is_finite() {
            // Floating-point sums depend on order. Follow JavaScript's usage-key order
            // so the final total agrees even at the stored cost column's 12th decimal place.
            total += cost;
            costs.insert(key.clone(), number_value(cost));
        }
    }

    if !costs.is_empty() && !costs.contains_key("total") {
        costs.insert("total".to_owned(), number_value(total));
    }
    costs
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::otel::types::OwnedEvent;
    use crate::otel::value::json;

    #[test]
    fn pricing_regex_uses_javascript_semantics_with_bounded_work() {
        let mut cache = PricingRegexCache::default();
        for (pattern, key, sensitive, operator, expected) in [
            (r"^\w+$", "entrée", true, "gt", false),
            (r"^\s$", "\u{a0}", true, "gt", true),
            (r"^[a-z]+$", "ſ", false, "gt", false),
            (r"^\k$", "k", true, "gt", true),
            (r"^input$", "INPUT", true, "gt", false),
            (r"^input$", "INPUT", false, "gt", true),
            // Skipping the emoji key leaves a sum of zero, so eq 0 succeeds.
            (r"^.$", "😀", true, "eq", true),
            (
                r"^(a|aa)+$",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab",
                true,
                "gt",
                false,
            ),
        ] {
            let usage = IndexMap::from([(key.to_owned(), json!(1))]);
            assert_eq!(
                matches_usage_condition(
                    &json!({
                        "usageDetailPattern": pattern, "caseSensitive": sensitive,
                        "operator": operator, "value": 0,
                    }),
                    &usage,
                    &mut cache
                ),
                expected,
                "{pattern} / {key}"
            );
        }
        let usage = IndexMap::from([("input".into(), json!(100)), ("😀".into(), json!(50))]);
        for (pattern, operator, value) in [(r"^input$", "gt", 10), (r".*", "eq", 100)] {
            assert!(matches_usage_condition(
                &json!({"usageDetailPattern": pattern, "operator": operator, "value": value}),
                &usage,
                &mut cache,
            ));
        }
    }

    #[test]
    fn reports_usage_mismatches_beyond_tolerance_without_changing_counts() {
        use crate::otel::metadata::tests::CapturingRecorder;
        use std::sync::atomic::Ordering;

        let recorder = CapturingRecorder::default();
        metrics::with_local_recorder(&recorder, || {
            for (total, input) in [(100, 101), (100, 102), (1000, 1010), (1000, 1011)] {
                let usage = IndexMap::from([
                    ("total".into(), json!(total)),
                    ("input".into(), json!(input)),
                ]);
                assert_eq!(add_usage_total(usage.clone()), usage);
            }
            assert_eq!(
                add_usage_total(IndexMap::from([("input".into(), json!(102))]))["total"],
                json!(102)
            );
        });
        let recorded = recorder.0.into_inner().unwrap();
        assert_eq!(
            recorded
                .iter()
                .map(|(_, value)| value.load(Ordering::Relaxed))
                .sum::<u64>(),
            2
        );
        for (key, _) in recorded {
            assert_eq!(
                key.name(),
                "langfuse.ingestion.usage_details.total_mismatch"
            );
            assert_eq!(
                key.labels()
                    .map(|label| (label.key(), label.value()))
                    .collect::<Vec<_>>(),
                [("write_path", "events")]
            );
        }
    }

    #[test]
    fn normalizes_usage_and_adds_total() {
        let event = OwnedEvent {
            provided_usage_details: IndexMap::from([
                ("input".into(), json!("2")),
                ("output".into(), json!(3)),
            ]),
            ..OwnedEvent::default()
        };
        let result = enrich(
            &event,
            &json!({"model": null, "pricingTiers": []}),
            &mut PricingRegexCache::default(),
        );
        assert_eq!(result.usage_details["input"], json!(2));
        assert_eq!(result.usage_details["output"], json!(3));
        assert_eq!(result.usage_details["total"], json!(5));
    }

    #[test]
    fn empty_usage_does_not_match_default_tier() {
        let event = OwnedEvent {
            row: crate::native_schema::OtelStorageRow {
                level: "ERROR".into(),
                ..Default::default()
            },
            ..OwnedEvent::default()
        };
        let lookup = json!({
            "model": {"id": "model"},
            "pricingTiers": [{"id": "default", "name": "Default", "isDefault": true, "prices": []}]
        });
        let result = enrich(&event, &lookup, &mut PricingRegexCache::default());
        assert!(result.usage_details.is_empty());
        assert!(result.usage_pricing_tier_id.is_none());
    }

    #[test]
    fn provided_costs_are_authoritative_and_get_an_input_output_total() {
        let event = OwnedEvent {
            provided_cost_details: BTreeMap::from([
                ("input".into(), json!(1.25)),
                ("output".into(), json!(0.75)),
            ]),
            ..OwnedEvent::default()
        };
        let result = enrich(
            &event,
            &json!({"model": {"id": "model"}}),
            &mut PricingRegexCache::default(),
        );
        assert!(result.usage_details.is_empty());
        assert_eq!(result.cost_details["total"], json!(2));
    }

    #[test]
    fn provided_cost_total_keeps_javascript_string_concatenation() {
        let event = OwnedEvent {
            provided_cost_details: BTreeMap::from([
                ("input".into(), json!(1.25)),
                ("output".into(), json!("0.75")),
            ]),
            ..OwnedEvent::default()
        };
        let result = enrich(
            &event,
            &json!({"model": {"id": "model"}}),
            &mut PricingRegexCache::default(),
        );
        assert_eq!(result.cost_details["total"], json!("1.250.75"));
    }

    #[test]
    fn pricing_attributes_match_top_level_model_parameter() {
        let event = OwnedEvent {
            model_parameters: Some(json!(r#"{"region":"eu","temperature":0.2}"#)),
            provided_usage_details: IndexMap::from([("input".into(), json!(1))]),
            ..OwnedEvent::default()
        };
        let lookup = json!({
            "model": {"id": "model"},
            "pricingTiers": [
                {"id": "eu", "name": "EU", "isDefault": false, "priority": 1,
                 "conditions": [{"source": "model_parameters", "key": "region", "values": ["eu"]}], "prices": []},
                {"id": "default", "name": "Default", "isDefault": true, "prices": []}
            ]
        });
        let result = enrich(&event, &lookup, &mut PricingRegexCache::default());
        assert_eq!(result.usage_pricing_tier_id.as_deref(), Some("eu"));
    }

    #[test]
    fn cache_ttl_usage_uses_the_aggregate_price_fallback() {
        let event = OwnedEvent {
            provided_usage_details: IndexMap::from([("input_cache_creation_5m".into(), json!(2))]),
            ..OwnedEvent::default()
        };
        let lookup = json!({
            "model": {"id": "model"},
            "pricingTiers": [{"id": "default", "name": "Default", "isDefault": true,
                "prices": [{"usageType": "input_cache_creation", "price": "0.5"}]}]
        });
        let result = enrich(&event, &lookup, &mut PricingRegexCache::default());
        assert_eq!(result.cost_details["input_cache_creation_5m"], json!(1));
        assert_eq!(result.cost_details["total"], json!(1));
    }
}
