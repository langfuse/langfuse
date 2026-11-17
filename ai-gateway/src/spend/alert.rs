//! Reports reached spend limits to Web, which emails the key's owner and the
//! organization's owners once per limit counting start and window. A flag next to
//! the limit's counter lets one request per window report it, so a key over its
//! limit does not call Web on every request.
use std::sync::Arc;

use super::store::{Counter, RedisCounters};
use crate::resolution::ControlPlaneClient;

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
    /// The counter's value at which the limit is reached: the limit less the baseline.
    pub reached_at_usd: f64,
    /// The limit's alert flag was already set when the request was checked.
    pub alerted: bool,
}

impl SpendAlerts {
    /// A limit whose report fails is reported again by the next request that reaches it.
    pub(super) async fn report(
        self,
        store: Arc<RedisCounters>,
        limits: impl IntoIterator<Item = CountedLimit>,
    ) {
        for limit in limits.into_iter().filter(|limit| !limit.alerted) {
            let flag = &limit.alerted_flag;
            // When Redis is unavailable, Web's own record still sends one email per window.
            if matches!(store.claim(flag, limit.counter.expires_at).await, Ok(false)) {
                continue;
            }
            let reported = self
                .control_plane
                .report_spend_limit_reached(
                    &self.gateway_key,
                    &limit.id,
                    limit.counting_started_at,
                    limit.window_start,
                    &self.request_id,
                )
                .await;
            if let Err(error) = reported {
                tracing::warn!(%error, limit_id = %limit.id, "spend limit alert failed");
                let _ = store.release(flag).await;
            }
        }
    }
}
