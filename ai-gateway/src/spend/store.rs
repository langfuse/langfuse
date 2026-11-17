//! Spend counters in Redis. Every key of one gateway key shares a hash tag, so
//! a check reads all of them in one `MGET`, in cluster mode too.
use std::time::Duration;

use redis::{
    aio::{ConnectionLike, ConnectionManager, ConnectionManagerConfig},
    cluster::ClusterClient,
    cluster_async::ClusterConnection,
};
use tokio::sync::OnceCell;

use crate::config::SpendCountersConfig;

/// Bounds every Redis call, so a slow Redis fails the check instead of stalling it.
const OPERATION_TIMEOUT: Duration = Duration::from_millis(500);

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

/// One Redis key holding the USD a scope spent in one window.
#[derive(Clone, Debug)]
pub(crate) struct Counter {
    pub key: String,
    /// Unix seconds, set again on every increment; never for a total counter.
    pub expires_at: Option<i64>,
}

impl Counter {
    /// Set once the counter's limit was reported reached in its window. Shares the
    /// counter's hash tag, so it is read in the same `MGET`. Keyed by the limit's
    /// amount, so a changed amount is reported again.
    pub(crate) fn alerted_flag(&self, limit_usd: f64) -> String {
        format!("{}:alerted:{limit_usd}", self.key)
    }
}

pub(crate) struct RedisCounters {
    config: SpendCountersConfig,
    connection: OnceCell<Connection>,
}

impl RedisCounters {
    pub(crate) fn new(config: SpendCountersConfig) -> Self {
        Self {
            config,
            connection: OnceCell::new(),
        }
    }

    /// Connects on first use; a failed attempt is retried by the next call.
    async fn connection(&self) -> Result<Connection, Unavailable> {
        let connection = tokio::time::timeout(
            OPERATION_TIMEOUT,
            self.connection.get_or_try_init(|| self.connect()),
        )
        .await
        .map_err(|_| Unavailable)?
        .inspect_err(|error| tracing::warn!(%error, "spend counter redis connection failed"))
        .map_err(|_| Unavailable)?;
        Ok(connection.clone())
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

    /// Each key's number, or `None` while it is unset.
    pub(crate) async fn read<K: redis::ToRedisArgs>(
        &self,
        keys: impl IntoIterator<Item = K>,
    ) -> Result<Vec<Option<f64>>, Unavailable> {
        let mut connection = self.connection().await?;
        let mut command = redis::cmd("MGET");
        for key in keys {
            command.arg(key);
        }
        tokio::time::timeout(OPERATION_TIMEOUT, connection.query(&command))
            .await
            .map_err(|_| Unavailable)?
            .inspect_err(|error| tracing::warn!(%error, "spend counter read failed"))
            .map_err(|_| Unavailable)
    }

    /// Adds `usd` to each counter and returns their new totals.
    pub(crate) async fn add<'a>(
        &self,
        counters: impl IntoIterator<Item = &'a Counter>,
        usd: f64,
    ) -> Result<Vec<f64>, Unavailable> {
        let mut connection = self.connection().await?;
        let mut pipeline = redis::pipe();
        for Counter { key, expires_at } in counters {
            pipeline.cmd("INCRBYFLOAT").arg(key).arg(usd);
            if let Some(unix_seconds) = expires_at {
                pipeline
                    .cmd("EXPIREAT")
                    .arg(key)
                    .arg(*unix_seconds)
                    .ignore();
            }
        }
        tokio::time::timeout(OPERATION_TIMEOUT, connection.query_pipeline(&pipeline))
            .await
            .map_err(|_| Unavailable)?
            .inspect_err(|error| tracing::warn!(%error, "spend counter update failed"))
            .map_err(|_| Unavailable)
    }

    /// Sets `key` unless it is set, expiring like a counter. Returns whether it was set.
    pub(crate) async fn claim(
        &self,
        key: &str,
        expires_at: Option<i64>,
    ) -> Result<bool, Unavailable> {
        let mut connection = self.connection().await?;
        let mut command = redis::cmd("SET");
        command.arg(key).arg(1).arg("NX");
        if let Some(unix_seconds) = expires_at {
            command.arg("EXAT").arg(unix_seconds);
        }
        tokio::time::timeout(
            OPERATION_TIMEOUT,
            connection.query::<Option<String>>(&command),
        )
        .await
        .map_err(|_| Unavailable)?
        .inspect_err(|error| tracing::warn!(%error, "spend counter claim failed"))
        .map(|set| set.is_some())
        .map_err(|_| Unavailable)
    }

    pub(crate) async fn release(&self, key: &str) -> Result<(), Unavailable> {
        let mut connection = self.connection().await?;
        tokio::time::timeout(
            OPERATION_TIMEOUT,
            connection.query(redis::cmd("DEL").arg(key)),
        )
        .await
        .map_err(|_| Unavailable)?
        .inspect_err(|error| tracing::warn!(%error, "spend counter release failed"))
        .map_err(|_| Unavailable)
    }
}
