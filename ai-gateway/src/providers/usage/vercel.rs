use serde_json::Value;

use super::ProviderUsage;
use crate::{resolution::ApiFormat, spend::UsageCostType};

pub(super) fn usage(
    api_format: ApiFormat,
    usage: &Value,
    provider_metadata: Option<&Value>,
) -> ProviderUsage {
    ProviderUsage {
        provided_cost_details: cost_details(usage)
            .or_else(|| provider_metadata.and_then(gateway_cost_details)),
        ..ProviderUsage::standard(api_format, usage)
    }
}

/// `cost` is what Vercel debited, in USD, surcharges included. A bring-your-own
/// provider key is billed by the provider, at the list price Vercel reports as
/// the upstream cost or, when that is null, as `market_cost`; the total adds it.
fn cost_details(usage: &Value) -> Option<UsageCostType> {
    let usd = |pointer: &str| {
        usage
            .pointer(pointer)?
            .as_f64()
            .filter(|usd| usd.is_finite() && *usd >= 0.0)
    };
    let cost = usd("/cost")?;
    let total = if usage.get("is_byok").and_then(Value::as_bool) == Some(true) {
        cost + usd("/cost_details/upstream_inference_cost").or_else(|| usd("/market_cost"))?
    } else {
        cost
    };
    Some(total_only(total))
}

/// Responses and Messages report Vercel's charge only in
/// `provider_metadata.gateway`, as decimal strings. On Vercel's own credentials
/// `cost` is the charge; on a bring-your-own key it is `0`, and `marketCost`
/// holds the provider's list price the customer pays instead. Other or mixed
/// credentials are left to price inference.
fn gateway_cost_details(provider_metadata: &Value) -> Option<UsageCostType> {
    let gateway = provider_metadata.get("gateway")?;
    let credentials = gateway
        .pointer("/routing/modelAttempts")?
        .as_array()?
        .iter()
        .filter_map(|attempt| attempt.get("providerAttempts")?.as_array())
        .flatten()
        .filter(|attempt| attempt.get("success").and_then(Value::as_bool) == Some(true))
        .map(|attempt| attempt.get("credentialType").and_then(Value::as_str))
        .collect::<Vec<_>>();
    let (first, rest) = credentials.split_first()?;
    let field = match first {
        Some("system") => "cost",
        Some("byok") => "marketCost",
        _ => return None,
    };
    if rest.iter().any(|kind| kind != first) {
        return None;
    }
    let cost = gateway
        .get(field)?
        .as_str()?
        .parse::<f64>()
        .ok()
        .filter(|usd| usd.is_finite() && *usd >= 0.0)?;
    Some(total_only(cost))
}

fn total_only(usd: f64) -> UsageCostType {
    UsageCostType::from([("total".into(), usd)])
}
