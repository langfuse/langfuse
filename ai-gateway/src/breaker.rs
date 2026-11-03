//! Per-connection circuit breaker for alias fallback targets, so a dead
//! target stops costing every request a connect timeout. It opens after
//! consecutive failures and turns half-open after a cooldown.

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Copy)]
pub(crate) struct BreakerConfig {
    /// Consecutive failures that open the breaker.
    pub threshold: u32,
    /// How long an open breaker refuses a target.
    pub cooldown: Duration,
}

impl Default for BreakerConfig {
    fn default() -> Self {
        Self {
            threshold: 3,
            cooldown: Duration::from_secs(30),
        }
    }
}

#[derive(Debug)]
enum State {
    /// Serving requests; consecutive failures are counted.
    Closed { failures: u32 },
    /// Refusing requests until `reopen_at`. Further failures are not counted.
    Open { reopen_at: Instant },
    /// Admitting probes. A failure re-opens, a success closes.
    HalfOpen,
}

#[derive(Debug, Default)]
struct Breakers {
    by_connection: HashMap<String, State>,
}

/// Shared across requests. The lock is never held across an await.
#[derive(Debug)]
pub(crate) struct CircuitBreakers {
    config: BreakerConfig,
    breakers: Mutex<Breakers>,
}

impl Default for CircuitBreakers {
    fn default() -> Self {
        Self::new(BreakerConfig::default())
    }
}

impl CircuitBreakers {
    pub(crate) fn new(config: BreakerConfig) -> Self {
        Self {
            config,
            breakers: Mutex::new(Breakers::default()),
        }
    }

    /// Whether a target may be attempted now. Half-open admits every request
    /// until a probe's outcome is recorded.
    pub(crate) fn allows(&self, connection_id: &str) -> bool {
        let mut breakers = self.lock();
        let Some(state) = breakers.by_connection.get_mut(connection_id) else {
            return true;
        };
        match state {
            State::Closed { .. } | State::HalfOpen => true,
            State::Open { reopen_at } => {
                if Instant::now() >= *reopen_at {
                    *state = State::HalfOpen;
                    true
                } else {
                    false
                }
            }
        }
    }

    /// Record a failure. Reaching the threshold or failing a probe opens it.
    pub(crate) fn record_failure(&self, connection_id: &str) {
        let mut breakers = self.lock();
        let failures = match breakers.by_connection.get(connection_id) {
            Some(State::Closed { failures }) => *failures + 1,
            Some(State::HalfOpen) => self.config.threshold,
            // A late failure from a request already in flight keeps the cooldown.
            Some(State::Open { .. }) => return,
            // The first failure already counts toward the threshold.
            None => 1,
        };
        if failures >= self.config.threshold {
            breakers.by_connection.insert(
                connection_id.to_owned(),
                State::Open {
                    reopen_at: Instant::now() + self.config.cooldown,
                },
            );
        } else {
            breakers
                .by_connection
                .insert(connection_id.to_owned(), State::Closed { failures });
        }
    }

    /// Record a success, closing the breaker.
    pub(crate) fn record_success(&self, connection_id: &str) {
        let mut breakers = self.lock();
        breakers
            .by_connection
            .insert(connection_id.to_owned(), State::Closed { failures: 0 });
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Breakers> {
        self.breakers
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests;
