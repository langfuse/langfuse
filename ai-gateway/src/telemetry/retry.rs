use std::time::Duration;

use super::otlp::ExportError;

#[derive(Clone, Copy)]
pub(super) struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay: Duration,
    pub max_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(10),
        }
    }
}

impl RetryPolicy {
    pub fn backoff(
        &self,
        attempt: u32,
        error: &ExportError,
        grant_remaining: Duration,
        random: u64,
    ) -> Option<Duration> {
        if attempt >= self.max_attempts || !error.is_transient() {
            return None;
        }
        let step = self
            .base_delay
            .saturating_mul(4u32.saturating_pow(attempt.saturating_sub(1)))
            .min(self.max_delay);
        let half = step / 2;
        let spread = u64::try_from(half.as_nanos()).unwrap_or(u64::MAX);
        let jittered = half + Duration::from_nanos(random % spread.saturating_add(1));
        let delay = match error.retry_after() {
            Some(hint) if hint > self.max_delay => return None,
            Some(hint) => hint.max(jittered),
            None => jittered,
        };
        (delay + MIN_SEND_WINDOW <= grant_remaining).then_some(delay)
    }
}

const MIN_SEND_WINDOW: Duration = Duration::from_secs(1);

pub(super) fn random() -> u64 {
    use std::hash::BuildHasher;
    std::hash::RandomState::new().hash_one(std::time::Instant::now())
}

#[cfg(test)]
mod tests;
