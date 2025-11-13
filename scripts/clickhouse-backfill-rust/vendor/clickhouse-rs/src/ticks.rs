use tokio::time::Duration;

const PERIOD_THRESHOLD: Duration = Duration::from_secs(365 * 24 * 3600);

// === Instant ===

// More efficient `Instant` based on TSC.
#[cfg(not(feature = "test-util"))]
type Instant = quanta::Instant;

#[cfg(feature = "test-util")]
type Instant = tokio::time::Instant;

// === Ticks ===

pub(crate) struct Ticks {
    period: Duration,
    max_bias: f64,
    origin: Instant,
    next_at: Option<Instant>,
}

impl Default for Ticks {
    fn default() -> Self {
        Self {
            period: Duration::MAX,
            max_bias: 0.,
            origin: Instant::now(),
            next_at: None,
        }
    }
}

impl Ticks {
    pub(crate) fn set_period(&mut self, period: Option<Duration>) {
        self.period = period.unwrap_or(Duration::MAX);
    }

    pub(crate) fn set_period_bias(&mut self, max_bias: f64) {
        self.max_bias = max_bias.clamp(0., 1.);
    }

    pub(crate) fn time_left(&self) -> Option<Duration> {
        self.next_at
            .map(|n| n.saturating_duration_since(Instant::now()))
    }

    pub(crate) fn reached(&self) -> bool {
        self.next_at.is_some_and(|n| Instant::now() >= n)
    }

    pub(crate) fn reschedule(&mut self) {
        self.next_at = self.calc_next_at();
    }

    fn calc_next_at(&mut self) -> Option<Instant> {
        // Disabled ticks, do nothing.
        if self.period >= PERIOD_THRESHOLD {
            return None;
        }

        let now = Instant::now();
        let elapsed = now - self.origin;

        let coef = (elapsed.subsec_nanos() & 0xffff) as f64 / 65535.;
        let max_bias = self.period.mul_f64(self.max_bias);
        let bias = max_bias.mul_f64(coef);
        let n = elapsed.as_nanos().checked_div(self.period.as_nanos())?;

        let next_at = self.origin + self.period * (n + 1) as u32 + 2 * bias - max_bias;

        // Special case if after skipping we hit biased zone.
        if next_at <= now {
            next_at.checked_add(self.period)
        } else {
            Some(next_at)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(feature = "test-util")] // only with `tokio::time::Instant`
    #[tokio::test(start_paused = true)]
    async fn smoke() {
        // No bias.
        let mut ticks = Ticks::default();
        ticks.set_period(Some(Duration::from_secs(10)));
        ticks.reschedule();

        assert_eq!(ticks.time_left(), Some(Duration::from_secs(10)));
        assert!(!ticks.reached());
        tokio::time::advance(Duration::from_secs(3)).await;
        ticks.reschedule();
        assert_eq!(ticks.time_left(), Some(Duration::from_secs(7)));
        assert!(!ticks.reached());
        tokio::time::advance(Duration::from_secs(7)).await;
        assert!(ticks.reached());
        ticks.reschedule();
        assert_eq!(ticks.time_left(), Some(Duration::from_secs(10)));
        assert!(!ticks.reached());

        // Up to 10% bias.
        ticks.set_period_bias(0.1);
        ticks.reschedule();
        assert_eq!(ticks.time_left(), Some(Duration::from_secs(9)));
        assert!(!ticks.reached());
        tokio::time::advance(Duration::from_secs(12)).await;
        assert!(ticks.reached());
        ticks.reschedule();
        assert_eq!(ticks.time_left(), Some(Duration::from_secs(7)));
        assert!(!ticks.reached());

        // Try other seeds.
        tokio::time::advance(Duration::from_nanos(32768)).await;
        ticks.reschedule();
        assert_eq!(
            ticks.time_left(),
            Some(Duration::from_secs_f64(7.999982492))
        );

        tokio::time::advance(Duration::from_nanos(32767)).await;
        ticks.reschedule();
        assert_eq!(
            ticks.time_left(),
            Some(Duration::from_secs_f64(8.999934465))
        );
    }

    #[cfg(feature = "test-util")] // only with `tokio::time::Instant`
    #[tokio::test(start_paused = true)]
    async fn skip_extra_ticks() {
        let mut ticks = Ticks::default();
        ticks.set_period(Some(Duration::from_secs(10)));
        ticks.set_period_bias(0.1);
        ticks.reschedule();

        // Trivial case, just skip several ticks.
        assert_eq!(ticks.time_left(), Some(Duration::from_secs(9)));
        assert!(!ticks.reached());
        tokio::time::advance(Duration::from_secs(30)).await;
        assert!(ticks.reached());
        ticks.reschedule();
        assert_eq!(ticks.time_left(), Some(Duration::from_secs(9)));
        assert!(!ticks.reached());

        // Hit biased zone.
        tokio::time::advance(Duration::from_secs(19)).await;
        assert!(ticks.reached());
        ticks.reschedule();
        assert_eq!(ticks.time_left(), Some(Duration::from_secs(10)));
        assert!(!ticks.reached());
    }

    #[tokio::test]
    async fn disabled() {
        let mut ticks = Ticks::default();
        assert_eq!(ticks.time_left(), None);
        assert!(!ticks.reached());
        ticks.reschedule();
        assert_eq!(ticks.time_left(), None);
        assert!(!ticks.reached());

        // Not disabled.
        ticks.set_period(Some(Duration::from_secs(10)));
        ticks.reschedule();
        assert!(ticks.time_left().unwrap() < Duration::from_secs(10));
        assert!(!ticks.reached());

        // Explicitly.
        ticks.set_period(None);
        ticks.reschedule();
        assert_eq!(ticks.time_left(), None);
        assert!(!ticks.reached());

        // Zero duration.
        ticks.set_period(Some(Duration::from_secs(0)));
        ticks.reschedule();
        assert_eq!(ticks.time_left(), None);
        assert!(!ticks.reached());

        // Too big duration.
        ticks.set_period(Some(PERIOD_THRESHOLD));
        ticks.reschedule();
        assert_eq!(ticks.time_left(), None);
        assert!(!ticks.reached());
    }
}
