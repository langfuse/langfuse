//! Spend limits of a key, of its owner and of its organization. Before forwarding, the counters
//! for the current windows are checked against every limit; after the
//! response, the request's cost is added to them. Requests are not reserved,
//! so concurrent requests can overshoot a limit by what they cost. A request
//! for a model Langfuse has no price for is rejected before it is forwarded; a
//! response that still adds nothing is counted in `gateway.spend.uncharged`;
//! one that adds a cost is counted in `gateway.spend.usd`.
//! Web is told when a limit is reached, so it can email the people it applies
//! to.
mod alert;
mod cost;
mod store;
mod tasks;
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
    providers::usage::{UsageDetails, provider_usage, reports_billed_cost},
    resolution::{
        ControlPlaneClient, ResolutionError, ResolvedRequestContext, SpendLimit, SpendLimitExceeded,
    },
};
use alert::{CountedLimit, SpendAlerts};
pub(crate) use cost::UsageCostType;
use cost::{
    CalculateModelUsageCostsParams, Model, ModelWithPrices, PricingAttributes,
    calculate_model_usage_costs,
};
use store::RedisCounters;
use tasks::TaskTracker;

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
    /// Caps the key owner's spend across all their keys in the organization.
    /// Its counter is keyed by the limit, so every key of the user adds to it.
    User,
    /// Caps the organization's spend across all its keys, so every key adds to
    /// the one counter of the limit.
    Organization,
}

impl SpendLimitScope {
    pub(crate) fn subject(self) -> &'static str {
        match self {
            Self::ApiKey => "This API key",
            Self::User => "This key's user",
            Self::Organization => "This organization",
        }
    }
}

#[derive(Clone, Default)]
pub(crate) struct SpendLimits {
    counters: Option<Arc<RedisCounters>>,
    control_plane: Option<Arc<ControlPlaneClient>>,
    tasks: Arc<TaskTracker>,
}

/// Counter writes and limit reports still running in the background.
pub struct SpendTasks(Arc<TaskTracker>);

impl SpendTasks {
    /// Waits for them until `deadline`; any still running then are abandoned.
    pub async fn shutdown(&self, deadline: tokio::time::Instant) {
        self.0.shutdown(deadline).await;
    }
}

impl SpendLimits {
    pub(crate) fn new(
        config: Option<SpendCountersConfig>,
        control_plane: Arc<ControlPlaneClient>,
    ) -> Self {
        Self {
            counters: config.map(|config| Arc::new(RedisCounters::new(config))),
            control_plane: Some(control_plane),
            tasks: Arc::default(),
        }
    }

    /// Connects to the counter Redis ahead of the first request. `None` when no Redis
    /// is configured.
    pub(crate) async fn open_connection(&self) -> Option<bool> {
        match &self.counters {
            Some(counters) => Some(counters.open_connection().await),
            None => None,
        }
    }

    pub(crate) fn tasks(&self) -> SpendTasks {
        SpendTasks(Arc::clone(&self.tasks))
    }

    /// Reject a key that has spent a limit for the current window. Fails closed:
    /// a key with limits is rejected while its spend cannot be read.
    pub(crate) async fn check(
        &self,
        context: &ResolvedRequestContext,
        gateway_key: &str,
        request_id: &str,
    ) -> Result<Option<SpendRecording>, ResolutionError> {
        let limits = context.spend_limits();
        if limits.is_empty() {
            return Ok(None);
        }
        let model = match priced_model(context) {
            Some(model) => model,
            None if reports_billed_cost(context.connection().provider()) => ModelWithPrices {
                model: None,
                pricing_tiers: Vec::new(),
            },
            None => return Err(ResolutionError::SpendLimitUnpricedModel),
        };
        let Some(store) = &self.counters else {
            tracing::warn!("key has spend limits but LANGFUSE_AI_GATEWAY_REDIS_URL is not set");
            return Err(ResolutionError::SpendLimitUnavailable);
        };
        let now = DateTime::<Utc>::from(SystemTime::now());
        let organization_id = context.attribution().organization_id().as_str();
        let usage = current_usage(store, limits, organization_id, now)
            .await
            .map_err(|_| ResolutionError::SpendLimitUnavailable)?;
        let alerts = self
            .control_plane
            .as_ref()
            .map(|control_plane| SpendAlerts {
                control_plane: Arc::clone(control_plane),
                gateway_key: gateway_key.to_owned(),
                request_id: request_id.to_owned(),
            });
        if let Some(exceeded) = usage.iter().find(|usage| usage.is_exceeded()) {
            let unreported: Vec<CountedLimit> = usage
                .iter()
                .filter(|usage| usage.is_exceeded() && !usage.alerted)
                .map(LimitUsage::counted)
                .collect();
            if let (Some(alerts), false) = (alerts, unreported.is_empty()) {
                self.tasks
                    .spawn(alerts.report(Arc::clone(store), unreported));
            }
            return Err(ResolutionError::SpendLimitExceeded(Box::new(
                exceeded.rejection(now),
            )));
        }
        let attribution = context.attribution();
        Ok(Some(SpendRecording {
            store: Arc::clone(store),
            tasks: Arc::clone(&self.tasks),
            provider: context.connection().provider().as_str(),
            organization_id: organization_id.to_owned(),
            project_id: attribution.project_id().map(|id| id.as_str().to_owned()),
            user_id: attribution.user_id().map(str::to_owned),
            limits: usage.iter().map(LimitUsage::counted).collect(),
            model,
            alerts,
        }))
    }
}

/// What each limit's scope has spent in its current window, and whether the limit
/// was already reported reached, read in one round trip.
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
    let keys: Vec<String> = windows
        .iter()
        .map(|window| window.counter.key.clone())
        .chain(
            limits
                .iter()
                .zip(&windows)
                .map(|(limit, window)| window.counter.alerted_flag(limit.limit_usd)),
        )
        .collect();
    let mut values = store.read(keys).await?;
    let flags = values.split_off(windows.len());
    Ok(limits
        .iter()
        .zip(windows)
        .zip(values.into_iter().zip(flags))
        .map(|((limit, window), (counted, flag))| {
            LimitUsage::new(limit, window, counted, flag.is_some())
        })
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

/// What a limit's scope has spent in the limit's current window.
struct LimitUsage<'a> {
    limit: &'a SpendLimit,
    window: Window,
    spent: f64,
    alerted: bool,
}

impl<'a> LimitUsage<'a> {
    /// `counted` is what the gateway counted in the window. Spend from before the
    /// limit's counting start does not count.
    fn new(limit: &'a SpendLimit, window: Window, counted: Option<f64>, alerted: bool) -> Self {
        Self {
            limit,
            window,
            spent: counted.unwrap_or(0.0),
            alerted,
        }
    }

    fn is_exceeded(&self) -> bool {
        self.spent >= self.limit.limit_usd
    }

    fn counted(&self) -> CountedLimit {
        CountedLimit {
            id: self.limit.id.clone(),
            counting_started_at: self.limit.counting_started_at,
            window_start: self.window.start.timestamp_millis(),
            alerted_flag: self.window.counter.alerted_flag(self.limit.limit_usd),
            counter: self.window.counter.clone(),
            limit_usd: self.limit.limit_usd,
            alerted: self.alerted,
        }
    }

    fn rejection(&self, now: DateTime<Utc>) -> SpendLimitExceeded {
        let spent = format!(
            "{} has spent ${:.2} of its ${:.2} {} budget.",
            self.limit.scope.subject(),
            self.spent,
            self.limit.limit_usd,
            self.limit.interval.as_str()
        );
        match self.window.end {
            Some(end) => SpendLimitExceeded::new(
                format!(
                    "{spent} The budget resets at {}.",
                    end.to_rfc3339_opts(SecondsFormat::Secs, true)
                ),
                u64::try_from((end - now).num_seconds().max(1)).ok(),
            ),
            None => SpendLimitExceeded::new(
                format!("{spent} An admin can raise or remove the budget."),
                None,
            ),
        }
    }
}

/// Adds an admitted request's cost to the counters it was checked against.
pub(crate) struct SpendRecording {
    store: Arc<RedisCounters>,
    tasks: Arc<TaskTracker>,
    provider: &'static str,
    organization_id: String,
    project_id: Option<String>,
    /// The key's owner; absent for keys not bound to a user.
    user_id: Option<String>,
    limits: Vec<CountedLimit>,
    model: ModelWithPrices,
    alerts: Option<SpendAlerts>,
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
        let cost = generation_cost(facts, metadata, &self.model);
        match cost
            .as_ref()
            .and_then(|cost| cost.total)
            .filter(|total| *total > 0.0)
        {
            Some(total) => {
                self.report_charged(total);
                self.add_in_background(total);
            }
            None => self.report_uncharged(facts, cost.as_ref()),
        }
        cost.filter(|cost| !cost.provided && !cost.details.is_empty())
            .map(|cost| cost.details)
    }

    /// The log's request correlation fields add the organization and project, so
    /// per-user spend can be derived from logs without a user-tagged metric.
    fn report_charged(&self, cost: f64) {
        crate::observability::spend_charged(
            cost,
            &self.organization_id,
            self.project_id.as_deref(),
            self.provider,
        );
        tracing::info!(
            cost_usd = cost,
            user_id = self.user_id.as_deref(),
            "gateway spend charged"
        );
    }

    /// A successful response that adds nothing usually means its usage is missing or
    /// named differently from the model's prices; a provider-reported zero is real.
    fn report_uncharged(&self, facts: &InferenceFacts, cost: Option<&GenerationCost>) {
        if !facts
            .http_status
            .is_some_and(|status| (200..300).contains(&status))
        {
            return;
        }
        let reason = match cost {
            Some(cost) if cost.provided => return,
            Some(cost) if cost.has_usage => "zero_cost",
            _ => "no_usage",
        };
        crate::observability::spend_uncharged(reason, self.provider);
        tracing::warn!(
            reason,
            provider = self.provider,
            model_id = self.model.model.as_ref().map(|model| model.id.as_str()),
            "spend-limited request added no cost"
        );
    }

    fn add_in_background(self, cost: f64) {
        let tasks = Arc::clone(&self.tasks);
        let provider = self.provider;
        let spawned = tasks.spawn(async move {
            // A retry after a timeout may count the cost twice; overcounting keeps the key
            // within its limit. A cost still unwritten after the last retry is lost.
            let counters = || self.limits.iter().map(|limit| &limit.counter);
            let mut added = self.store.add(counters(), cost).await;
            for delay in COUNTER_WRITE_RETRY_DELAYS {
                if added.is_ok() {
                    break;
                }
                tokio::time::sleep(delay).await;
                added = self.store.add(counters(), cost).await;
            }
            let (Ok(totals), Some(alerts)) = (added, self.alerts) else {
                return;
            };
            let reached = self
                .limits
                .into_iter()
                .zip(totals)
                .filter(|(limit, total)| *total >= limit.limit_usd)
                .map(|(limit, _)| limit)
                .collect::<Vec<_>>();
            alerts.report(self.store, reached).await;
        });
        if !spawned {
            crate::observability::spend_uncharged("backlog", provider);
            tracing::warn!(provider, "spend counter write dropped: too many pending");
        }
    }
}

struct GenerationCost {
    details: UsageCostType,
    total: Option<f64>,
    /// The provider reported the cost, so the generation already carries it.
    provided: bool,
    /// The usage counted some units, so a zero total means they had no price.
    has_usage: bool,
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
    let usage_units = with_generic_names(
        usage
            .usage_details
            .as_ref()
            .map(UsageDetails::usage_units)
            .unwrap_or_default(),
        model,
    );
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
        has_usage: usage_units.values().any(|units| *units > 0.0),
    })
}

/// Anthropic reports `input_tokens` and `output_tokens`, but older and custom models
/// are often priced only as `input` and `output`. A name no tier prices takes its
/// generic name, so such a model is charged instead of costing nothing. Ingestion
/// prices these at zero; the generation carries the charged cost instead.
fn with_generic_names(usage: UsageCostType, model: &ModelWithPrices) -> UsageCostType {
    let priced = |usage_type: &str| {
        model
            .pricing_tiers
            .iter()
            .any(|tier| tier.prices.contains_key(usage_type))
    };
    usage
        .into_iter()
        .map(|(usage_type, units)| {
            let generic = match usage_type.as_str() {
                "input_tokens" => "input",
                "output_tokens" => "output",
                _ => return (usage_type, units),
            };
            if priced(&usage_type) || !priced(generic) {
                (usage_type, units)
            } else {
                (generic.to_owned(), units)
            }
        })
        .collect()
}

#[cfg(test)]
mod tests;
