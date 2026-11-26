//! Reports reached spend limit thresholds to Web, which emails recipients once
//! per limit counting start, threshold and window. A flag next to each limit's
//! counter lets one request per window report each threshold, so a key past a
//! threshold does not call Web on every request. Alerts one request triggers
//! together are reported, and emailed, together.
use std::sync::Arc;

use super::store::{Counter, RedisCounters};
use crate::resolution::{ControlPlaneClient, ReachedSpendLimit};

/// Where one request reports reached limit thresholds.
pub(super) struct SpendAlerts {
    pub control_plane: Arc<ControlPlaneClient>,
    pub gateway_key: String,
    pub request_id: String,
}

/// One configured percentage threshold of a limit, with its Redis dedup flag state.
#[derive(Clone)]
pub(super) struct AlertThreshold {
    pub percent: u8,
    pub flag: String,
    /// The threshold's alert flag was already set when the request was checked.
    pub alerted: bool,
}

/// A limit a request is counted against.
pub(super) struct CountedLimit {
    pub id: String,
    /// Unix milliseconds, as resolve returned them.
    pub counting_started_at: i64,
    /// Unix milliseconds.
    pub window_start: i64,
    pub counter: Counter,
    pub limit_usd: f64,
    /// Configured alert thresholds for this limit, in ascending order.
    pub thresholds: Vec<AlertThreshold>,
}

/// One threshold of a limit that has been reached and not yet reported.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct TriggeredAlert {
    pub id: String,
    pub counting_started_at: i64,
    pub window_start: i64,
    pub expires_at: Option<i64>,
    pub threshold_percent: u8,
    pub alerted_flag: String,
}

impl CountedLimit {
    /// Returns the highest configured threshold reached at `spent` if it has not
    /// already been reported. Only the highest reached threshold fires so a
    /// single request that jumps across multiple thresholds sends one alert.
    pub(super) fn into_unreported_alert(self, spent: f64) -> Option<TriggeredAlert> {
        let highest = self
            .thresholds
            .into_iter()
            .filter(|threshold| spent >= threshold_usd(self.limit_usd, threshold.percent))
            .max_by_key(|threshold| threshold.percent)?;
        if highest.alerted {
            return None;
        }
        Some(TriggeredAlert {
            id: self.id,
            counting_started_at: self.counting_started_at,
            window_start: self.window_start,
            expires_at: self.counter.expires_at,
            threshold_percent: highest.percent,
            alerted_flag: highest.flag,
        })
    }
}

pub(super) fn highest_reached_threshold(
    thresholds: &[AlertThreshold],
    limit_usd: f64,
    spent: f64,
) -> Option<&AlertThreshold> {
    thresholds
        .iter()
        .filter(|threshold| spent >= threshold_usd(limit_usd, threshold.percent))
        .max_by_key(|threshold| threshold.percent)
}

fn threshold_usd(limit_usd: f64, percent: u8) -> f64 {
    if percent >= 100 {
        limit_usd
    } else {
        limit_usd * (f64::from(percent) / 100.0)
    }
}

impl SpendAlerts {
    /// Reports every threshold this request is first to claim in one call.
    /// Alerts whose report fails are reported again by the next request that
    /// reaches them.
    pub(super) async fn report(self, store: Arc<RedisCounters>, alerts: Vec<TriggeredAlert>) {
        if alerts.is_empty() {
            return;
        }
        let claims = store
            .claim(
                alerts
                    .iter()
                    .map(|alert| (alert.alerted_flag.as_str(), alert.expires_at)),
            )
            .await;
        let claimed: Vec<TriggeredAlert> = match claims {
            Ok(set) => alerts
                .into_iter()
                .zip(set)
                .filter_map(|(alert, set)| set.then_some(alert))
                .collect(),
            // When Redis is unavailable, Web's own record still sends one email per window.
            Err(_) => alerts,
        };
        if claimed.is_empty() {
            return;
        }
        let reached: Vec<ReachedSpendLimit<'_>> = claimed
            .iter()
            .map(|alert| ReachedSpendLimit {
                limit_id: &alert.id,
                counting_started_at: alert.counting_started_at,
                window_start: alert.window_start,
                threshold_percent: (alert.threshold_percent < 100)
                    .then_some(alert.threshold_percent),
            })
            .collect();
        let reported = self
            .control_plane
            .report_spend_limits_reached(&self.gateway_key, &reached, &self.request_id)
            .await;
        if let Err(error) = reported {
            let limit_ids: Vec<&str> = claimed.iter().map(|alert| alert.id.as_str()).collect();
            tracing::warn!(%error, ?limit_ids, "spend limit alert failed");
            let _ = store
                .release(claimed.iter().map(|alert| alert.alerted_flag.as_str()))
                .await;
        }
    }
}
