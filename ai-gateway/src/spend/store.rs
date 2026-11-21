//! Spend counters in Redis. Every key of one gateway key shares a hash tag, so
//! a check reads all of them in one `MGET`, in cluster mode too.
use std::{
    future::Future,
    sync::atomic::{AtomicU32, AtomicU64, Ordering},
    time::Duration,
};

use redis::{
    aio::{ConnectionLike, ConnectionManager, ConnectionManagerConfig},
    cluster::ClusterClient,
    cluster_async::ClusterConnection,
};
use tokio::{sync::OnceCell, time::Instant};

use crate::config::SpendCountersConfig;

/// Bounds every Redis call, so a slow Redis fails the check instead of stalling it.
const OPERATION_TIMEOUT: Duration = Duration::from_millis(500);
/// Consecutive failed calls after which calls fail without trying Redis.
const BREAKER_THRESHOLD: u32 = 3;
/// How long calls fail without trying Redis once the breaker opens.
const BREAKER_COOLDOWN: Duration = Duration::from_secs(1);

#[derive(Debug)]
pub(crate) struct Unavailable;

#[derive(Clone)]
enum Connection {
    Single(ConnectionManager),
    Cluster(ClusterConnection),
}

impl Connection {
    async fn query<T: redis::FromRedisValue>(
        &mut self,
        command: &redis::Cmd,
    ) -> redis::RedisResult<T> {
        match self {
            Self::Single(connection) => command.query_async(connection).await,
            Self::Cluster(connection) => command.query_async(connection).await,
        }
    }

    async fn query_pipeline<T: redis::FromRedisValue>(
        &mut self,
        pipeline: &redis::Pipeline,
    ) -> redis::RedisResult<T> {
        match self {
            Self::Single(connection) => run_pipeline(pipeline, connection).await,
            Self::Cluster(connection) => run_pipeline(pipeline, connection).await,
        }
    }
}

async fn run_pipeline<T: redis::FromRedisValue>(
    pipeline: &redis::Pipeline,
    connection: &mut (impl ConnectionLike + Send),
) -> redis::RedisResult<T> {
    pipeline.query_async(connection).await
}

/// Fails calls fast while Redis keeps failing, so requests for limited keys get
/// their 503 at once instead of after the timeout. After the cooldown calls go
/// through again; the first failure reopens it, the first success closes it.
struct Breaker {
    origin: Instant,
    consecutive_failures: AtomicU32,
    /// Milliseconds after `origin`.
    open_until: AtomicU64,
}

impl Breaker {
    fn new() -> Self {
        Self {
            origin: Instant::now(),
            consecutive_failures: AtomicU32::new(0),
            open_until: AtomicU64::new(0),
        }
    }

    fn elapsed_ms(&self) -> u64 {
        u64::try_from(self.origin.elapsed().as_millis()).unwrap_or(u64::MAX)
    }

    fn is_open(&self) -> bool {
        self.elapsed_ms() < self.open_until.load(Ordering::Relaxed)
    }

    fn record(&self, succeeded: bool) {
        if succeeded {
            self.consecutive_failures.store(0, Ordering::Relaxed);
            return;
        }
        let failures = self.consecutive_failures.fetch_add(1, Ordering::Relaxed) + 1;
        if failures >= BREAKER_THRESHOLD {
            let cooldown = u64::try_from(BREAKER_COOLDOWN.as_millis()).unwrap_or(u64::MAX);
            self.open_until.store(
                self.elapsed_ms().saturating_add(cooldown),
                Ordering::Relaxed,
            );
        }
    }
}

enum Failure {
    TimedOut,
    Redis(redis::RedisError),
}

/// One Redis key holding the USD a scope spent in one window.
#[derive(Clone, Debug)]
pub(crate) struct Counter {
    pub key: String,
    /// Unix seconds, set by the first increment; never for a total counter.
    pub expires_at: Option<i64>,
}

impl Counter {
    /// Set once the counter's threshold was reported reached in its window. Shares
    /// the counter's hash tag, so it is read in the same `MGET`. Keyed by the
    /// limit's amount and threshold, so a changed amount or higher threshold is
    /// reported again.
    pub(crate) fn alerted_flag(&self, limit_usd: f64, threshold_percent: u8) -> String {
        if threshold_percent == 100 {
            format!("{}:alerted:{limit_usd}", self.key)
        } else {
            format!("{}:alerted:{limit_usd}:{threshold_percent}", self.key)
        }
    }
}

pub(crate) struct RedisCounters {
    config: SpendCountersConfig,
    connection: OnceCell<Connection>,
    breaker: Breaker,
}

impl RedisCounters {
    pub(crate) fn new(config: SpendCountersConfig) -> Self {
        Self {
            config,
            connection: OnceCell::new(),
            breaker: Breaker::new(),
        }
    }

    /// Connects ahead of the first request. A failed attempt is retried by the next call.
    pub(crate) async fn open_connection(&self) -> bool {
        self.connection
            .get_or_try_init(|| self.connect())
            .await
            .inspect_err(|error| tracing::warn!(%error, "spend counter redis connection failed"))
            .is_ok()
    }

    async fn connect(&self) -> redis::RedisResult<Connection> {
        if self.config.cluster {
            let connection = ClusterClient::builder(self.config.nodes.iter().map(String::as_str))
                .connection_timeout(OPERATION_TIMEOUT)
                .response_timeout(OPERATION_TIMEOUT)
                .build()?
                .get_async_connection()
                .await?;
            return Ok(Connection::Cluster(connection));
        }
        let node = self.config.nodes.first().map_or("", String::as_str);
        let connection = redis::Client::open(node)?
            .get_connection_manager_with_config(
                ConnectionManagerConfig::new()
                    .set_connection_timeout(Some(OPERATION_TIMEOUT))
                    .set_response_timeout(Some(OPERATION_TIMEOUT)),
            )
            .await?;
        Ok(Connection::Single(connection))
    }

    /// Runs one call on the connection, connecting first if needed. Connecting and
    /// the call are each bounded by the timeout.
    async fn run<T, F>(
        &self,
        operation: &'static str,
        call: impl FnOnce(Connection) -> F,
    ) -> Result<T, Unavailable>
    where
        F: Future<Output = redis::RedisResult<T>>,
    {
        if self.breaker.is_open() {
            return Err(Unavailable);
        }
        let result = async {
            let connection = tokio::time::timeout(
                OPERATION_TIMEOUT,
                self.connection.get_or_try_init(|| self.connect()),
            )
            .await
            .map_err(|_| Failure::TimedOut)?
            .map_err(Failure::Redis)?
            .clone();
            tokio::time::timeout(OPERATION_TIMEOUT, call(connection))
                .await
                .map_err(|_| Failure::TimedOut)?
                .map_err(Failure::Redis)
        }
        .await;
        self.breaker.record(result.is_ok());
        result.map_err(|failure| {
            match failure {
                Failure::TimedOut => {
                    tracing::warn!(operation, "spend counter redis call timed out");
                }
                Failure::Redis(error) => {
                    tracing::warn!(%error, operation, "spend counter redis call failed");
                }
            }
            Unavailable
        })
    }

    /// Each key's number, or `None` while it is unset.
    pub(crate) async fn read<K: redis::ToRedisArgs>(
        &self,
        keys: impl IntoIterator<Item = K>,
    ) -> Result<Vec<Option<f64>>, Unavailable> {
        let mut command = redis::cmd("MGET");
        for key in keys {
            command.arg(key);
        }
        self.run("read", move |mut connection| async move {
            connection.query(&command).await
        })
        .await
    }

    /// Adds `usd` to each counter and returns their new totals.
    pub(crate) async fn add<'a>(
        &self,
        counters: impl IntoIterator<Item = &'a Counter>,
        usd: f64,
    ) -> Result<Vec<f64>, Unavailable> {
        let mut pipeline = redis::pipe();
        for Counter { key, expires_at } in counters {
            pipeline.cmd("INCRBYFLOAT").arg(key).arg(usd);
            if let Some(unix_seconds) = expires_at {
                // `NX` (Redis 7) leaves an expiry already set alone; it is the same time.
                pipeline
                    .cmd("EXPIREAT")
                    .arg(key)
                    .arg(*unix_seconds)
                    .arg("NX")
                    .ignore();
            }
        }
        self.run("add", move |mut connection| async move {
            connection.query_pipeline(&pipeline).await
        })
        .await
    }

    /// Sets each key unless it is set, expiring like its counter, in one round trip.
    /// Returns, per key, whether it was set.
    pub(crate) async fn claim<'a>(
        &self,
        keys: impl IntoIterator<Item = (&'a str, Option<i64>)>,
    ) -> Result<Vec<bool>, Unavailable> {
        let mut pipeline = redis::pipe();
        for (key, expires_at) in keys {
            pipeline.cmd("SET").arg(key).arg(1).arg("NX");
            if let Some(unix_seconds) = expires_at {
                pipeline.arg("EXAT").arg(unix_seconds);
            }
        }
        if pipeline.cmd_iter().next().is_none() {
            return Ok(Vec::new());
        }
        let set: Vec<Option<String>> = self
            .run("claim", move |mut connection| async move {
                connection.query_pipeline(&pipeline).await
            })
            .await?;
        Ok(set.into_iter().map(|set| set.is_some()).collect())
    }

    /// Deletes the keys in one round trip.
    pub(crate) async fn release<'a>(
        &self,
        keys: impl IntoIterator<Item = &'a str>,
    ) -> Result<(), Unavailable> {
        let mut pipeline = redis::pipe();
        for key in keys {
            pipeline.cmd("DEL").arg(key).ignore();
        }
        if pipeline.cmd_iter().next().is_none() {
            return Ok(());
        }
        self.run("release", move |mut connection| async move {
            connection.query_pipeline(&pipeline).await
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn breaker_fails_fast_after_repeated_failures_until_redis_answers() {
        let breaker = Breaker::new();
        for _ in 1..BREAKER_THRESHOLD {
            breaker.record(false);
        }
        assert!(!breaker.is_open());
        breaker.record(false);
        assert!(breaker.is_open());

        tokio::time::advance(BREAKER_COOLDOWN).await;
        assert!(!breaker.is_open());
        breaker.record(false);
        assert!(
            breaker.is_open(),
            "one failure after the cooldown reopens it"
        );

        tokio::time::advance(BREAKER_COOLDOWN).await;
        breaker.record(true);
        breaker.record(false);
        assert!(!breaker.is_open(), "a success starts the count again");
    }
}
