use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use serde::Deserialize;

use super::store::Counter;
use crate::resolution::SpendLimit;

/// Windowed counters outlive their window by this much, so a pod whose clock runs
/// behind still reads the counter the others write. A cost added after the counter
/// expired is dropped with it, which is harmless: the next window uses a new key.
const WINDOW_EXPIRY_GRACE_SECONDS: i64 = 10 * 60;

/// How often a spend limit starts over, in UTC calendar windows. Web computes
/// the same windows in `web/src/features/ai-gateway/fns/gatewaySpendLimitWindow.ts`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SpendLimitInterval {
    Daily,
    Weekly,
    Monthly,
    Total,
}

impl SpendLimitInterval {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
            Self::Total => "total",
        }
    }

    /// Midnight, the Monday of the week, or the 1st of the month `now` falls
    /// in. The single total window starts at the Unix epoch.
    pub(crate) fn window_start(self, now: DateTime<Utc>) -> DateTime<Utc> {
        let date = now.date_naive();
        let start = match self {
            Self::Daily => date,
            Self::Weekly => date - Duration::days(i64::from(date.weekday().num_days_from_monday())),
            Self::Monthly => date.with_day(1).unwrap_or(date),
            Self::Total => return DateTime::UNIX_EPOCH,
        };
        midnight(start)
    }

    /// When the window starting at `start` closes; never for total.
    pub(crate) fn window_end(self, start: DateTime<Utc>) -> Option<DateTime<Utc>> {
        let date = start.date_naive();
        let end = match self {
            Self::Daily => date.succ_opt()?,
            Self::Weekly => date.checked_add_signed(Duration::days(7))?,
            Self::Monthly => {
                let (year, month) = if date.month() == 12 {
                    (date.year() + 1, 1)
                } else {
                    (date.year(), date.month() + 1)
                };
                NaiveDate::from_ymd_opt(year, month, 1)?
            }
            Self::Total => return None,
        };
        Some(midnight(end))
    }
}

/// The window of a limit that `now` falls in, and the counter its spend is added to.
pub(super) struct Window {
    pub counter: Counter,
    pub start: DateTime<Utc>,
    pub end: Option<DateTime<Utc>>,
}

impl Window {
    pub(super) fn current(organization_id: &str, limit: &SpendLimit, now: DateTime<Utc>) -> Self {
        let start = limit.interval.window_start(now);
        let end = limit.interval.window_end(start);
        // A new counting start begins a new key.
        // All limits of a request belong to one organization, so tagging the
        // organization keeps them on one cluster slot for a single MGET. Only the
        // gateway reads or writes keys under this prefix.
        let key = format!(
            "gateway-spend:{{{organization_id}}}:{}:{}:{}",
            limit.id,
            limit.counting_started_at,
            start.timestamp()
        );
        // A total counter never expires, so it must live in a Redis that does not evict.
        let expires_at = end.map(|end| end.timestamp() + WINDOW_EXPIRY_GRACE_SECONDS);
        Self {
            counter: Counter { key, expires_at },
            start,
            end,
        }
    }
}

fn midnight(date: NaiveDate) -> DateTime<Utc> {
    Utc.from_utc_datetime(&date.and_time(chrono::NaiveTime::MIN))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(text).unwrap().to_utc()
    }

    #[test]
    fn windows_follow_utc_calendar_boundaries() {
        // A Sunday late in December, so the week starts in the previous month.
        let now = at("2026-12-27T23:59:59Z");
        let cases = [
            (
                SpendLimitInterval::Daily,
                "2026-12-27T00:00:00Z",
                Some("2026-12-28T00:00:00Z"),
            ),
            (
                SpendLimitInterval::Weekly,
                "2026-12-21T00:00:00Z",
                Some("2026-12-28T00:00:00Z"),
            ),
            (
                SpendLimitInterval::Monthly,
                "2026-12-01T00:00:00Z",
                Some("2027-01-01T00:00:00Z"),
            ),
            (SpendLimitInterval::Total, "1970-01-01T00:00:00Z", None),
        ];
        for (interval, start, end) in cases {
            let window_start = interval.window_start(now);
            assert_eq!(window_start, at(start), "{}", interval.as_str());
            assert_eq!(
                interval.window_end(window_start),
                end.map(at),
                "{}",
                interval.as_str()
            );
        }
        assert_eq!(
            SpendLimitInterval::Weekly.window_start(at("2026-12-28T00:00:00Z")),
            at("2026-12-28T00:00:00Z")
        );
    }
}
