//! Price normalized usage with a model's pricing tiers. A port of
//! `packages/shared/src/server/pricing-tiers/{matcher,calculateModelUsageCosts}.ts`
//! that keeps its structure, names and branching so the two can be diffed.
//! `tests/fixtures/cost-cases.json`, generated from the TypeScript, pins both.
//!
//! Known differences: prices are `f64` rather than `Decimal`, and patterns use
//! the `regex` crate, which rejects look-around; such a pattern fails its
//! condition, as an invalid pattern does in TypeScript.
use std::collections::{BTreeMap, BTreeSet};

use regex::RegexBuilder;
use serde::Deserialize;
use serde_json::Value;

/// Usage type to units, or usage type to USD.
pub(crate) type UsageCostType = BTreeMap<String, f64>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum UsageOperator {
    Gt,
    Gte,
    Lt,
    Lte,
    Eq,
    Neq,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AttributeSource {
    ModelParameters,
    Metadata,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub(crate) enum PricingTierCondition {
    Attribute {
        source: AttributeSource,
        key: String,
        values: Vec<String>,
    },
    Usage {
        usage_detail_pattern: String,
        operator: UsageOperator,
        value: f64,
        case_sensitive: bool,
    },
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PricingTierWithPrices {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub priority: i64,
    pub conditions: Vec<PricingTierCondition>,
    pub prices: BTreeMap<String, f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PricingTierMatchResult {
    pub pricing_tier_id: String,
    pub pricing_tier_name: String,
    pub prices: BTreeMap<String, f64>,
}

#[derive(Default)]
pub(crate) struct PricingTierMatchAttributes {
    pub model_parameters: BTreeMap<String, String>,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Clone, Debug)]
pub(crate) struct Model {
    pub id: String,
}

#[derive(Clone, Debug)]
pub(crate) struct ModelWithPrices {
    pub model: Option<Model>,
    pub pricing_tiers: Vec<PricingTierWithPrices>,
}

/// The request's top-level model parameters and metadata.
#[derive(Default)]
pub(crate) struct PricingAttributes<'a> {
    pub model_parameters: Option<&'a Value>,
    pub metadata: Option<&'a Value>,
}

#[derive(Debug, PartialEq)]
pub(crate) struct CalculatedCosts {
    pub cost_details: UsageCostType,
    pub total_cost: Option<f64>,
}

#[derive(Debug, PartialEq)]
pub(crate) struct ModelUsageCosts {
    pub cost_details: UsageCostType,
    pub total_cost: Option<f64>,
    pub internal_model_id: Option<String>,
    pub usage_pricing_tier_id: Option<String>,
    pub usage_pricing_tier_name: Option<String>,
}

// Custom models may only have aggregate cache-write pricing.
const TTL_CACHE_CREATION_USAGE_TYPES: [&str; 2] =
    ["input_cache_creation_5m", "input_cache_creation_1h"];
const AGGREGATE_CACHE_CREATION_USAGE_TYPES: [&str; 2] =
    ["cache_creation_input_tokens", "input_cache_creation"];

fn is_non_bmp(key: &str) -> bool {
    key.chars().any(|character| u32::from(character) > 0xFFFF)
}

/// Usage conditions sum keys matching the regex; attribute conditions compare an
/// exact top-level key against the configured values.
fn evaluate_condition(
    condition: &PricingTierCondition,
    usage_details: &UsageCostType,
    attributes: &PricingTierMatchAttributes,
) -> bool {
    match condition {
        PricingTierCondition::Attribute {
            source,
            key,
            values,
        } => {
            let values_by_key = match source {
                AttributeSource::ModelParameters => &attributes.model_parameters,
                AttributeSource::Metadata => &attributes.metadata,
            };
            let Some(attribute_value) = values_by_key.get(key) else {
                return false;
            };
            values.contains(attribute_value)
        }
        PricingTierCondition::Usage {
            usage_detail_pattern,
            operator,
            value,
            case_sensitive,
        } => {
            // Fail-safe: condition fails on error
            let Ok(regex) = RegexBuilder::new(usage_detail_pattern)
                .case_insensitive(!case_sensitive)
                .build()
            else {
                return false;
            };

            // Non-BMP keys do not contribute to usage-condition sums.
            let sum: f64 = usage_details
                .iter()
                .filter(|(key, _)| !is_non_bmp(key) && regex.is_match(key))
                .map(|(_, units)| *units)
                .sum();

            #[expect(
                clippy::float_cmp,
                reason = "mirrors the TypeScript === and !== comparisons"
            )]
            match operator {
                UsageOperator::Gt => sum > *value,
                UsageOperator::Gte => sum >= *value,
                UsageOperator::Lt => sum < *value,
                UsageOperator::Lte => sum <= *value,
                UsageOperator::Eq => sum == *value,
                UsageOperator::Neq => sum != *value,
            }
        }
    }
}

/// All conditions must pass. Empty conditions never match; only a default tier
/// applies without conditions.
fn evaluate_conditions(
    conditions: &[PricingTierCondition],
    usage_details: &UsageCostType,
    attributes: &PricingTierMatchAttributes,
) -> bool {
    if conditions.is_empty() {
        return false;
    }
    conditions
        .iter()
        .all(|condition| evaluate_condition(condition, usage_details, attributes))
}

fn has_pricing_tier_usage_details(usage_details: &UsageCostType) -> bool {
    !usage_details.is_empty()
}

fn to_match_result(tier: &PricingTierWithPrices) -> PricingTierMatchResult {
    PricingTierMatchResult {
        pricing_tier_id: tier.id.clone(),
        pricing_tier_name: tier.name.clone(),
        prices: tier.prices.clone(),
    }
}

/// Non-default tiers in ascending priority, the first whose conditions all
/// match, else the default tier.
fn match_pricing_tier(
    tiers: &[PricingTierWithPrices],
    usage_details: &UsageCostType,
    attributes: &PricingTierMatchAttributes,
) -> Option<PricingTierMatchResult> {
    let mut sorted_tiers: Vec<&PricingTierWithPrices> =
        tiers.iter().filter(|tier| !tier.is_default).collect();
    sorted_tiers.sort_by_key(|tier| tier.priority);

    for tier in sorted_tiers {
        if evaluate_conditions(&tier.conditions, usage_details, attributes) {
            return Some(to_match_result(tier));
        }
    }

    tiers
        .iter()
        .find(|tier| tier.is_default)
        .map(to_match_result)
}

/// `String(value)` of a JavaScript number: integral values print without a fraction.
fn javascript_number_string(number: &serde_json::Number) -> String {
    match number.as_f64() {
        Some(value) if value.fract() == 0.0 && value.abs() < 1e21 => format!("{value:.0}"),
        _ => number.to_string(),
    }
}

fn to_pricing_attribute_record(value: Option<&Value>) -> BTreeMap<String, String> {
    let parsed_value = match value {
        Some(Value::String(text)) => serde_json::from_str(text).ok(),
        Some(value) => Some(value.clone()),
        None => None,
    };
    let Some(Value::Object(parsed_value)) = parsed_value else {
        return BTreeMap::new();
    };
    parsed_value
        .into_iter()
        .filter_map(|(key, attribute_value)| {
            let text = match attribute_value {
                Value::String(text) => text,
                Value::Number(number) => javascript_number_string(&number),
                Value::Bool(flag) => flag.to_string(),
                Value::Null | Value::Array(_) | Value::Object(_) => return None,
            };
            Some((key, text))
        })
        .collect()
}

fn get_pricing_tier_attributes(
    pricing_tiers: &[PricingTierWithPrices],
    attributes: Option<&PricingAttributes<'_>>,
) -> PricingTierMatchAttributes {
    let mut attribute_sources = BTreeSet::new();
    for tier in pricing_tiers {
        if tier.is_default {
            continue;
        }
        for condition in &tier.conditions {
            if let PricingTierCondition::Attribute { source, .. } = condition {
                attribute_sources.insert(*source);
            }
        }
    }
    PricingTierMatchAttributes {
        model_parameters: if attribute_sources.contains(&AttributeSource::ModelParameters) {
            to_pricing_attribute_record(
                attributes.and_then(|attributes| attributes.model_parameters),
            )
        } else {
            BTreeMap::new()
        },
        metadata: if attribute_sources.contains(&AttributeSource::Metadata) {
            to_pricing_attribute_record(attributes.and_then(|attributes| attributes.metadata))
        } else {
            BTreeMap::new()
        },
    }
}

fn select_pricing_tier(
    pricing_tiers: &[PricingTierWithPrices],
    usage_details: &UsageCostType,
    attributes: Option<&PricingAttributes<'_>>,
) -> Option<PricingTierMatchResult> {
    // Empty usage must not select a tier against a fabricated all-zero vector.
    if pricing_tiers.is_empty() || !has_pricing_tier_usage_details(usage_details) {
        return None;
    }
    let match_attributes = get_pricing_tier_attributes(pricing_tiers, attributes);
    match_pricing_tier(pricing_tiers, usage_details, &match_attributes)
}

fn calculate_provided_costs(provided_cost_details: &UsageCostType) -> Option<CalculatedCosts> {
    if provided_cost_details.is_empty() {
        return None;
    }

    // A supplied cost disables catalog inference for all other cost buckets.
    let cost_details = provided_cost_details.clone();
    let mut total_cost = provided_cost_details.get("total").copied();
    if total_cost.is_none()
        && provided_cost_details
            .keys()
            .all(|key| key == "input" || key == "output")
    {
        total_cost = Some(
            provided_cost_details.get("input").copied().unwrap_or(0.0)
                + provided_cost_details.get("output").copied().unwrap_or(0.0),
        );
    }
    Some(CalculatedCosts {
        cost_details,
        total_cost,
    })
}

fn calculate_inferred_costs(
    usage_details: &UsageCostType,
    matched_tier: Option<&PricingTierMatchResult>,
) -> CalculatedCosts {
    let empty = BTreeMap::new();
    let prices = matched_tier.map_or(&empty, |tier| &tier.prices);
    let mut cost_entries: Vec<(String, f64)> = Vec::new();
    for (usage_type, units) in usage_details {
        let mut price = prices.get(usage_type).copied();
        if price.is_none() && TTL_CACHE_CREATION_USAGE_TYPES.contains(&usage_type.as_str()) {
            price = AGGREGATE_CACHE_CREATION_USAGE_TYPES
                .iter()
                .find_map(|key| prices.get(*key).copied());
        }
        if let Some(price) = price {
            cost_entries.push((usage_type.clone(), price * units));
        }
    }
    let cost_details: UsageCostType = cost_entries.iter().cloned().collect();
    let mut total_cost = cost_details.get("total").copied();
    if total_cost.is_none() && !cost_entries.is_empty() {
        total_cost = Some(cost_entries.iter().map(|(_, cost)| cost).sum());
    }
    CalculatedCosts {
        cost_details,
        total_cost,
    }
}

pub(crate) struct CalculateModelUsageCostsParams<'a> {
    pub model: &'a ModelWithPrices,
    pub usage_details: &'a UsageCostType,
    pub provided_cost_details: Option<&'a UsageCostType>,
    pub attributes: Option<&'a PricingAttributes<'a>>,
}

/// Price usage with a resolved model, retaining provided-cost precedence.
pub(crate) fn calculate_model_usage_costs(
    CalculateModelUsageCostsParams {
        model,
        usage_details,
        provided_cost_details,
        attributes,
    }: CalculateModelUsageCostsParams<'_>,
) -> ModelUsageCosts {
    let matched_tier = select_pricing_tier(&model.pricing_tiers, usage_details, attributes);
    let CalculatedCosts {
        mut cost_details,
        total_cost,
    } = calculate_provided_costs(provided_cost_details.unwrap_or(&BTreeMap::new()))
        .unwrap_or_else(|| calculate_inferred_costs(usage_details, matched_tier.as_ref()));
    if let Some(total_cost) = total_cost {
        cost_details.entry("total".into()).or_insert(total_cost);
    }
    ModelUsageCosts {
        cost_details,
        total_cost,
        internal_model_id: model.model.as_ref().map(|model| model.id.clone()),
        usage_pricing_tier_id: matched_tier
            .as_ref()
            .map(|tier| tier.pricing_tier_id.clone()),
        usage_pricing_tier_name: matched_tier.map(|tier| tier.pricing_tier_name),
    }
}

#[cfg(test)]
mod tests;
