//! Reports reached spend limits to Web, which emails the key's owner and the
//! organization's owners once per limit generation and window. A flag next to the
//! limit's counter lets one request per window report it, so a key over its limit
//! does not call Web on every request.
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
    pub generation: u32,
    pub counter: Counter,
    /// The counter's value at which the limit is reached: the limit less the baseline.
    pub reached_at_usd: f64,
}

impl SpendAlerts {
    pub(super) fn report_in_background(self, store: Arc<RedisCounters>, limits: Vec<CountedLimit>) {
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            runtime.spawn(self.report(store, limits));
        }
    }

    /// A limit whose report fails is reported again by the next request that reaches it.
    pub(super) async fn report(self, store: Arc<RedisCounters>, limits: Vec<CountedLimit>) {
        for limit in limits {
            let flag = format!("{}:alerted", limit.counter.key);
            // When Redis is unavailable, Web's own record still sends one email per window.
            if matches!(store.claim(&flag, limit.counter.expiry).await, Ok(false)) {
                continue;
            }
            let reported = self
                .control_plane
                .report_spend_limit_reached(
                    &self.gateway_key,
                    &limit.id,
                    limit.generation,
                    &self.request_id,
                )
                .await;
            if let Err(error) = reported {
                tracing::warn!(%error, limit_id = %limit.id, "spend limit alert failed");
                let _ = store.release(&flag).await;
            }
        }
    }
}
