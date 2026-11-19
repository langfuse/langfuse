//! Reports reached spend limits to Web, which emails the key's owner and the
//! organization's owners once per limit counting start and window. A flag next to
//! each limit's counter lets one request per window report it, so a key over its
//! limit does not call Web on every request. Limits one request reaches together
//! are reported, and emailed, together.
use std::sync::Arc;

use super::store::{Counter, RedisCounters};
use crate::resolution::{ControlPlaneClient, ReachedSpendLimit};

/// Where one request reports reached limits.
pub(super) struct SpendAlerts {
    pub control_plane: Arc<ControlPlaneClient>,
    pub gateway_key: String,
    pub request_id: String,
}

/// A limit a request is counted against.
pub(super) struct CountedLimit {
    pub id: String,
    /// Unix milliseconds, as resolve returned them.
    pub counting_started_at: i64,
    /// Unix milliseconds.
    pub window_start: i64,
    pub counter: Counter,
    pub alerted_flag: String,
    pub limit_usd: f64,
    /// The limit's alert flag was already set when the request was checked.
    pub alerted: bool,
}

impl SpendAlerts {
    /// Reports every limit this request is first to claim in one call. Limits whose
    /// report fails are reported again by the next request that reaches them.
    pub(super) async fn report(
        self,
        store: Arc<RedisCounters>,
        limits: impl IntoIterator<Item = CountedLimit>,
    ) {
        let unreported: Vec<CountedLimit> =
            limits.into_iter().filter(|limit| !limit.alerted).collect();
        let claims = store
            .claim(
                unreported
                    .iter()
                    .map(|limit| (limit.alerted_flag.as_str(), limit.counter.expires_at)),
            )
            .await;
        let claimed: Vec<CountedLimit> = match claims {
            Ok(set) => unreported
                .into_iter()
                .zip(set)
                .filter_map(|(limit, set)| set.then_some(limit))
                .collect(),
            // When Redis is unavailable, Web's own record still sends one email per window.
            Err(_) => unreported,
        };
        if claimed.is_empty() {
            return;
        }
        let reached: Vec<ReachedSpendLimit<'_>> = claimed
            .iter()
            .map(|limit| ReachedSpendLimit {
                limit_id: &limit.id,
                counting_started_at: limit.counting_started_at,
                window_start: limit.window_start,
            })
            .collect();
        let reported = self
            .control_plane
            .report_spend_limits_reached(&self.gateway_key, &reached, &self.request_id)
            .await;
        if let Err(error) = reported {
            let limit_ids: Vec<&str> = claimed.iter().map(|limit| limit.id.as_str()).collect();
            tracing::warn!(%error, ?limit_ids, "spend limit alert failed");
            let _ = store
                .release(claimed.iter().map(|limit| limit.alerted_flag.as_str()))
                .await;
        }
    }
}
