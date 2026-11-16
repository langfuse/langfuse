//! Per-key spend limits. Before forwarding, a key's counters for the current
//! windows are checked against its limits; after the response, the request's
//! cost is added to them. Requests are not reserved, so concurrent requests
//! can overshoot a limit by what they cost.
mod cost;
mod store;
mod usage;
mod window;

use std::{sync::Arc, time::Duration, time::SystemTime};

use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::{Map, Value};

pub(crate) use cost::PricingTierWithPrices;
pub(crate) use window::SpendLimitInterval;

use crate::{
    capture::InferenceFacts,
    config::SpendCountersConfig,
    resolution::{ResolutionError, ResolvedRequestContext, SpendLimit, SpendLimitExceeded},
};
use cost::{PricingAttributes, UsageCostType, calculate_model_usage_costs};
use store::{Expiry, RedisCounters};

/// Windowed counters outlive their window by a day, so a request that started
/// just before the window ended still finds its counter.
const WINDOW_EXPIRY_GRACE_SECONDS: i64 = 24 * 60 * 60;
/// A lifetime counter idle for longer than this starts over.
const LIFETIME_COUNTER_EXPIRY: Duration = Duration::from_hours(400 * 24);
/// Backoff between attempts to add a finished request's cost while Redis is unavailable.
const COUNTER_WRITE_RETRY_DELAYS: [Duration; 3] = [
    Duration::from_millis(250),
    Duration::from_secs(1),
    Duration::from_secs(4),
];

#[derive(Clone, Default)]
pub(crate) struct SpendLimits {
    counters: Option<Arc<RedisCounters>>,
}

impl SpendLimits {
    pub(crate) fn new(config: Option<SpendCountersConfig>) -> Self {
        Self {
            counters: config.map(|config| Arc::new(RedisCounters::new(config))),
        }
    }

    /// Reject a key that has spent a limit for the current window. Fails closed:
    /// a key with limits is rejected while its spend cannot be read.
    pub(crate) async fn check(
        &self,
        context: &ResolvedRequestContext,
    ) -> Result<Option<SpendRecording>, ResolutionError> {
        let limits = context.spend_limits();
        if limits.is_empty() {
            return Ok(None);
        }
        let Some(store) = &self.counters else {
            tracing::warn!("key has spend limits but LANGFUSE_AI_GATEWAY_REDIS_URL is not set");
            return Err(ResolutionError::SpendLimitUnavailable);
        };
        let now = DateTime::<Utc>::from(SystemTime::now());
        let key_id = context.attribution().key_id();
        let windows: Vec<Window> = limits
            .iter()
            .map(|limit| Window::current(key_id, limit, now))
            .collect();
        let keys: Vec<String> = windows.iter().map(|window| window.key.clone()).collect();
        let counted = store
            .read_counters(&keys)
            .await
            .map_err(|_| ResolutionError::SpendLimitUnavailable)?;
        for ((limit, window), counted) in limits.iter().zip(&windows).zip(counted) {
            let baseline = if limit.baseline_window_start == window.start.timestamp() {
                limit.baseline_usd
            } else {
                0.0
            };
            let spent = counted.unwrap_or(0.0) + baseline;
            if spent >= limit.limit_usd {
                return Err(ResolutionError::SpendLimitExceeded(Box::new(exceeded(
                    limit, window, spent, now,
                ))));
            }
        }
        Ok(Some(SpendRecording {
            store: Arc::clone(store),
            counters: windows
                .into_iter()
                .map(|window| (window.key, window.expiry))
                .collect(),
            tiers: context
                .pricing()
                .map(|pricing| pricing.tiers.clone())
                .unwrap_or_default(),
        }))
    }
}

struct Window {
    key: String,
    start: DateTime<Utc>,
    end: Option<DateTime<Utc>>,
    expiry: Expiry,
}

impl Window {
    fn current(key_id: &str, limit: &SpendLimit, now: DateTime<Utc>) -> Self {
        let start = limit.interval.window_start(now);
        let end = limit.interval.window_end(start);
        // A reset bumps the generation, so counting starts over in a new key.
        let key = format!(
            "ai-gateway:spend:{{{key_id}}}:{}:{}:{}",
            limit.id,
            limit.generation,
            start.timestamp()
        );
        let expiry = end.map_or(Expiry::After(LIFETIME_COUNTER_EXPIRY), |end| {
            Expiry::At(end.timestamp() + WINDOW_EXPIRY_GRACE_SECONDS)
        });
        Self {
            key,
            start,
            end,
            expiry,
        }
    }
}

fn exceeded(
    limit: &SpendLimit,
    window: &Window,
    spent: f64,
    now: DateTime<Utc>,
) -> SpendLimitExceeded {
    let spent = format!(
        "This API key has spent ${spent:.2} of its ${:.2} {} spend limit.",
        limit.limit_usd,
        limit.interval.as_str()
    );
    match window.end {
        Some(end) => SpendLimitExceeded::new(
            format!(
                "{spent} The limit resets at {}.",
                end.to_rfc3339_opts(SecondsFormat::Secs, true)
            ),
            u64::try_from((end - now).num_seconds().max(1)).ok(),
        ),
        None => SpendLimitExceeded::new(
            format!("{spent} An admin can reset or raise the limit."),
            None,
        ),
    }
}

/// Adds an admitted request's cost to the counters it was checked against.
pub(crate) struct SpendRecording {
    store: Arc<RedisCounters>,
    counters: Vec<(String, Expiry)>,
    tiers: Vec<PricingTierWithPrices>,
}

impl SpendRecording {
    /// Price the finished generation and add it to the counters in the background.
    /// `metadata` is the generation's metadata as ingestion stores it, so metadata
    /// pricing-tier conditions match the tier ingestion will charge.
    pub(crate) fn record(self, facts: &InferenceFacts, metadata: &Map<String, Value>) {
        let Some(cost) = generation_cost(facts, metadata, &self.tiers).filter(|cost| *cost > 0.0)
        else {
            return;
        };
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return;
        };
        runtime.spawn(async move {
            // A retry after a timeout may count the cost twice; overcounting keeps the key
            // within its limit. A cost still unwritten after the last retry is lost.
            for delay in COUNTER_WRITE_RETRY_DELAYS {
                if self
                    .store
                    .add_to_counters(&self.counters, cost)
                    .await
                    .is_ok()
                {
                    return;
                }
                tokio::time::sleep(delay).await;
            }
            let _ = self.store.add_to_counters(&self.counters, cost).await;
        });
    }
}

/// What Langfuse will charge for the generation: the provider's own cost when it
/// reports one, else its usage priced with the model's tiers.
fn generation_cost(
    facts: &InferenceFacts,
    metadata: &Map<String, Value>,
    tiers: &[PricingTierWithPrices],
) -> Option<f64> {
    let inference = &facts.inference;
    let usage = inference.usage_details.as_ref()?;
    let provider = facts.metadata.get("provider").and_then(Value::as_str);
    let usage_units = crate::capture::langfuse_usage_details(facts.api_format, provider, usage)
        .map(|usage_details| usage::usage_units(&usage_details))
        .unwrap_or_default();
    let provided_cost_details = crate::providers::usage::provided_cost_details(
        provider,
        usage,
        inference.provider_metadata.as_ref(),
    )
    .and_then(|details| usd_amounts(&details));
    let model_parameters = Value::Object(inference.model_parameters.clone());
    let metadata = Value::Object(metadata.clone());
    let costs = calculate_model_usage_costs(
        tiers,
        &usage_units,
        provided_cost_details.as_ref(),
        &PricingAttributes {
            model_parameters: Some(&model_parameters),
            metadata: Some(&metadata),
        },
    );
    costs.total_cost.filter(|cost| cost.is_finite())
}

fn usd_amounts(details: &Value) -> Option<UsageCostType> {
    let amounts: UsageCostType = details
        .as_object()?
        .iter()
        .filter_map(|(key, usd)| Some((key.clone(), usd.as_f64()?)))
        .collect();
    (!amounts.is_empty()).then_some(amounts)
}

#[cfg(test)]
mod tests;
