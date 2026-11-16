//! Per-key spend limits. Before forwarding, a key's counters for the current
//! windows are checked against its limits; after the response, the request's
//! cost is added to them. Requests are not reserved, so concurrent requests
//! can overshoot a limit by what they cost. A request the gateway could not
//! price afterwards, because Langfuse has no price for the model or the
//! connection may not report usage, is rejected before it is forwarded.
mod cost;
mod store;
mod window;

use std::{sync::Arc, time::Duration, time::SystemTime};

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Deserialize;
use serde_json::{Map, Value};

pub(crate) use cost::PricingTierWithPrices;
pub(crate) use window::SpendLimitInterval;
use window::Window;

use crate::{
    capture::InferenceFacts,
    config::SpendCountersConfig,
    providers::usage::{UsageDetails, provider_usage},
    resolution::{
        Provider, ProviderConnection, ResolutionError, ResolvedRequestContext, SpendLimit,
        SpendLimitExceeded,
    },
};
pub(crate) use cost::UsageCostType;
use cost::{
    CalculateModelUsageCostsParams, Model, ModelWithPrices, PricingAttributes,
    calculate_model_usage_costs,
};
use store::{Counter, RedisCounters};

/// Backoff between attempts to add a finished request's cost while Redis is unavailable.
const COUNTER_WRITE_RETRY_DELAYS: [Duration; 3] = [
    Duration::from_millis(250),
    Duration::from_secs(1),
    Duration::from_secs(4),
];

/// What a spend limit caps. Resolve returns only the limits that apply to the
/// request, so the scope just names the subject in errors.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SpendLimitScope {
    ApiKey,
}

impl SpendLimitScope {
    pub(crate) fn subject(self) -> &'static str {
        match self {
            Self::ApiKey => "This API key",
        }
    }
}

#[derive(Clone, Default)]
pub(crate) struct SpendLimits {
    spend_storage: Option<Arc<RedisCounters>>,
}

impl SpendLimits {
    pub(crate) fn new(config: Option<SpendCountersConfig>) -> Self {
        Self {
            spend_storage: config.map(|config| Arc::new(RedisCounters::new(config))),
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
        let model = priced_model(context).ok_or(ResolutionError::SpendLimitUnpricedModel)?;
        if !reports_usage(context.connection()) {
            return Err(ResolutionError::SpendLimitUnmeteredConnection);
        }
        let Some(store) = &self.spend_storage else {
            tracing::warn!("key has spend limits but LANGFUSE_AI_GATEWAY_REDIS_URL is not set");
            return Err(ResolutionError::SpendLimitUnavailable);
        };
        let now = DateTime::<Utc>::from(SystemTime::now());
        let organization_id = context.attribution().organization_id().as_str();
        let usage = current_usage(store, limits, organization_id, now)
            .await
            .map_err(|_| ResolutionError::SpendLimitUnavailable)?;
        if let Some(exceeded) = usage.iter().find(|usage| usage.is_exceeded()) {
            return Err(ResolutionError::SpendLimitExceeded(Box::new(
                exceeded.rejection(now),
            )));
        }
        Ok(Some(SpendRecording {
            store: Arc::clone(store),
            counters: usage
                .into_iter()
                .map(|usage| usage.window.counter)
                .collect(),
            model,
        }))
    }
}

/// What each limit's scope has spent in its current window, read in one round trip.
async fn current_usage<'a>(
    store: &RedisCounters,
    limits: &'a [SpendLimit],
    organization_id: &str,
    now: DateTime<Utc>,
) -> Result<Vec<LimitUsage<'a>>, store::Unavailable> {
    let windows: Vec<Window> = limits
        .iter()
        .map(|limit| Window::current(organization_id, limit, now))
        .collect();
    let counted = store
        .read(windows.iter().map(|window| &window.counter))
        .await?;
    Ok(limits
        .iter()
        .zip(windows)
        .zip(counted)
        .map(|((limit, window), counted)| LimitUsage::new(limit, window, counted))
        .collect())
}

/// The model with its pricing tiers, when Langfuse has a price for the model.
fn priced_model(context: &ResolvedRequestContext) -> Option<ModelWithPrices> {
    let pricing = context.pricing()?;
    pricing
        .tiers
        .iter()
        .any(|tier| !tier.prices.is_empty())
        .then(|| ModelWithPrices {
            model: Some(Model {
                id: pricing.model_id.clone(),
            }),
            pricing_tiers: pricing.tiers.clone(),
        })
}

/// Whether a response through the connection reports the usage a request is priced by.
/// Every provider API the gateway speaks reports usage, but a user-entered base URL can
/// front any compatible server, so only the provider's own API is trusted. An Azure
/// connection always carries its resource's base URL and reports usage as `OpenAI` does.
fn reports_usage(connection: &ProviderConnection) -> bool {
    connection.provider() == Provider::Azure || !connection.has_custom_base_url()
}

/// What a limit's scope has spent in the limit's current window.
struct LimitUsage<'a> {
    limit: &'a SpendLimit,
    window: Window,
    spent: f64,
}

impl<'a> LimitUsage<'a> {
    /// `counted` is what the gateway counted in the window; spend recorded before it
    /// started counting is added while the window is the baseline's.
    fn new(limit: &'a SpendLimit, window: Window, counted: Option<f64>) -> Self {
        let baseline = if limit.baseline_window_start == window.start.timestamp() {
            limit.baseline_usd
        } else {
            0.0
        };
        Self {
            limit,
            window,
            spent: counted.unwrap_or(0.0) + baseline,
        }
    }

    fn is_exceeded(&self) -> bool {
        self.spent >= self.limit.limit_usd
    }

    fn rejection(&self, now: DateTime<Utc>) -> SpendLimitExceeded {
        let spent = format!(
            "{} has spent ${:.2} of its ${:.2} {} spend limit.",
            self.limit.scope.subject(),
            self.spent,
            self.limit.limit_usd,
            self.limit.interval.as_str()
        );
        match self.window.end {
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
}

/// Adds an admitted request's cost to the counters it was checked against.
pub(crate) struct SpendRecording {
    store: Arc<RedisCounters>,
    counters: Vec<Counter>,
    model: ModelWithPrices,
}

impl SpendRecording {
    /// Price the finished generation and add it to the counters in the background.
    /// `metadata` is the generation's metadata as ingestion stores it, so metadata
    /// pricing-tier conditions match the tier ingestion will charge. Returns the
    /// cost details priced from the model's tiers, so the generation can carry the
    /// amount the key was charged; none when the provider reported its own cost.
    pub(crate) fn record(
        self,
        facts: &InferenceFacts,
        metadata: &Map<String, Value>,
    ) -> Option<UsageCostType> {
        let cost = generation_cost(facts, metadata, &self.model)?;
        let total = cost.total.filter(|total| *total > 0.0);
        if let (Some(total), Ok(runtime)) = (total, tokio::runtime::Handle::try_current()) {
            self.add_in_background(&runtime, total);
        }
        (!cost.provided && !cost.details.is_empty()).then_some(cost.details)
    }

    fn add_in_background(self, runtime: &tokio::runtime::Handle, cost: f64) {
        runtime.spawn(async move {
            // A retry after a timeout may count the cost twice; overcounting keeps the key
            // within its limit. A cost still unwritten after the last retry is lost.
            for delay in COUNTER_WRITE_RETRY_DELAYS {
                if self.store.add(&self.counters, cost).await.is_ok() {
                    return;
                }
                tokio::time::sleep(delay).await;
            }
            let _ = self.store.add(&self.counters, cost).await;
        });
    }
}

struct GenerationCost {
    details: UsageCostType,
    total: Option<f64>,
    /// The provider reported the cost, so the generation already carries it.
    provided: bool,
}

/// What Langfuse will charge for the generation: the provider's own cost when it
/// reports one, else its usage priced with the model's tiers.
fn generation_cost(
    facts: &InferenceFacts,
    metadata: &Map<String, Value>,
    model: &ModelWithPrices,
) -> Option<GenerationCost> {
    let inference = &facts.inference;
    let usage = inference.usage_details.as_ref()?;
    let provider = facts.metadata.get("provider").and_then(Value::as_str);
    let usage = provider_usage(
        facts.api_format,
        provider,
        usage,
        inference.provider_metadata.as_ref(),
    );
    let usage_units = usage
        .usage_details
        .as_ref()
        .map(UsageDetails::usage_units)
        .unwrap_or_default();
    let provided_cost_details = usage.provided_cost_details;
    let model_parameters = Value::Object(inference.model_parameters.clone());
    let metadata = Value::Object(metadata.clone());
    let costs = calculate_model_usage_costs(CalculateModelUsageCostsParams {
        model,
        usage_details: &usage_units,
        provided_cost_details: provided_cost_details.as_ref(),
        attributes: Some(&PricingAttributes {
            model_parameters: Some(&model_parameters),
            metadata: Some(&metadata),
        }),
    });
    let finite = |usd: &f64| usd.is_finite();
    Some(GenerationCost {
        total: costs.total_cost.filter(finite),
        details: costs
            .cost_details
            .into_iter()
            .filter(|(_, usd)| finite(usd))
            .collect(),
        provided: provided_cost_details.is_some(),
    })
}

#[cfg(test)]
mod tests;
