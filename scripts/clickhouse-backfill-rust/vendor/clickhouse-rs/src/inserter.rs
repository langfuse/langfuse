use std::mem;

use tokio::time::Duration;

use crate::{
    Client,
    error::Result,
    insert::Insert,
    row::{Row, RowWrite},
    ticks::Ticks,
};

/// Performs multiple consecutive `INSERT`s.
///
/// By default, it **doesn't** end the current active `INSERT` automatically.
/// Use `with_max_bytes`, `with_max_rows` and `with_period` to set limits.
/// Alternatively, call `force_commit` to forcibly end an active `INSERT`.
///
/// Rows are being sent progressively to spread network load.
///
/// All rows written by [`Inserter::write()`] between [`Inserter::commit()`]
/// calls are sent in one `INSERT` statement.
#[must_use]
pub struct Inserter<T> {
    client: Client,
    table: String,
    max_bytes: u64,
    max_rows: u64,
    send_timeout: Option<Duration>,
    end_timeout: Option<Duration>,
    insert: Option<Insert<T>>,
    ticks: Ticks,
    pending: Quantities,
    in_transaction: bool,

    #[allow(clippy::type_complexity)]
    on_commit: Option<Box<dyn FnMut(&Quantities) + Send + 'static>>,
}

/// Statistics about pending or inserted data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Quantities {
    /// The number of uncompressed bytes.
    pub bytes: u64,
    /// The number for rows (calls of [`Inserter::write`]).
    pub rows: u64,
    /// The number of nonempty transactions (calls of [`Inserter::commit`]).
    pub transactions: u64,
}

impl Quantities {
    /// Just zero quantities, nothing special.
    pub const ZERO: Quantities = Quantities {
        bytes: 0,
        rows: 0,
        transactions: 0,
    };
}

impl<T> Inserter<T>
where
    T: Row,
{
    pub(crate) fn new(client: &Client, table: &str) -> Self {
        Self {
            client: client.clone(),
            table: table.into(),
            max_bytes: u64::MAX,
            max_rows: u64::MAX,
            send_timeout: None,
            end_timeout: None,
            insert: None,
            ticks: Ticks::default(),
            pending: Quantities::ZERO,
            in_transaction: false,
            on_commit: None,
        }
    }

    /// See [`Insert::with_timeouts()`].
    ///
    /// Note that [`Inserter::commit()`] can call [`Insert::end()`] inside,
    /// so `end_timeout` is also applied to `commit()` method.
    pub fn with_timeouts(
        mut self,
        send_timeout: Option<Duration>,
        end_timeout: Option<Duration>,
    ) -> Self {
        self.set_timeouts(send_timeout, end_timeout);
        self
    }

    /// The maximum number of uncompressed bytes in one `INSERT` statement.
    ///
    /// This is the soft limit, which can be exceeded if rows between
    /// [`Inserter::commit()`] calls are larger than set value.
    ///
    /// Note: ClickHouse inserts batches atomically only if all rows fit in the
    /// same partition and their number is less [`max_insert_block_size`].
    ///
    /// Unlimited (`u64::MAX`) by default.
    ///
    /// [`max_insert_block_size`]: https://clickhouse.tech/docs/en/operations/settings/settings/#settings-max_insert_block_size
    pub fn with_max_bytes(mut self, threshold: u64) -> Self {
        self.set_max_bytes(threshold);
        self
    }

    /// The maximum number of rows in one `INSERT` statement.
    ///
    /// In order to reduce overhead of merging small parts by ClickHouse, use
    /// larger values (e.g. 100_000 or even larger). Consider also/instead
    /// [`Inserter::with_max_bytes()`] if rows can be large.
    ///
    /// This is the soft limit, which can be exceeded if multiple rows are
    /// written between [`Inserter::commit()`] calls.
    ///
    /// Note: ClickHouse inserts batches atomically only if all rows fit in the
    /// same partition and their number is less [`max_insert_block_size`].
    ///
    /// Unlimited (`u64::MAX`) by default.
    ///
    /// [`max_insert_block_size`]: https://clickhouse.tech/docs/en/operations/settings/settings/#settings-max_insert_block_size
    pub fn with_max_rows(mut self, threshold: u64) -> Self {
        self.set_max_rows(threshold);
        self
    }

    /// The time between `INSERT`s.
    ///
    /// Note that [`Inserter`] doesn't spawn tasks or threads to check the
    /// elapsed time, all checks are performend only on [`Inserter::commit()`].
    /// However, it's possible to use [`Inserter::time_left()`] and set a
    /// timer up to call [`Inserter::commit()`] to check passed time again.
    ///
    /// Usually, it's reasonable to use 1-10s period, but it depends on
    /// desired delay for reading the data from the table.
    /// Larger values = less overhead for merging parts by CH.
    /// Smaller values = less delay for readers.
    ///
    /// Extra ticks are skipped if the previous `INSERT` is still in progress:
    /// ```text
    /// Expected ticks: |     1     |     2     |     3     |     4     |     5     |     6     |
    /// Actual ticks:   | work -----|          delay          | work ---| work -----| work -----|
    /// ```
    ///
    /// Unlimited (`None`) by default.
    pub fn with_period(mut self, period: Option<Duration>) -> Self {
        self.set_period(period);
        self
    }

    /// Adds a bias to the period, so actual period is in the following range:
    ///
    /// ```text
    ///   [period * (1 - bias), period * (1 + bias)]
    /// ```
    ///
    /// The `bias` parameter is clamped to the range `[0, 1]`.
    ///
    /// It helps to avoid producing a lot of `INSERT`s at the same time by
    /// multiple inserters.
    pub fn with_period_bias(mut self, bias: f64) -> Self {
        self.set_period_bias(bias);
        self
    }

    /// Set the [roles] to use when executing `INSERT` statements.
    ///
    /// Overrides any roles previously set by this method, [`Inserter::with_option`],
    /// [`Client::with_roles`] or [`Client::with_option`].
    ///
    /// An empty iterator may be passed to clear the set roles.
    ///
    /// # Note
    /// This does not take effect until the next `INSERT` statement begins
    /// if one is already in-progress.
    ///
    /// If you have already begun writing data, you may call [`Inserter::force_commit`]
    /// to end the current `INSERT` so this takes effect on the next call to [`Inserter::write`].
    ///
    /// [roles]: https://clickhouse.com/docs/operations/access-rights#role-management
    pub fn with_roles(mut self, roles: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.client.set_roles(roles);
        self
    }

    /// Clear any explicit [roles] previously set on this `Inserter` or inherited from [`Client`].
    ///
    /// Overrides any roles previously set by [`Inserter::with_roles`], [`Inserter::with_option`],
    /// [`Client::with_roles`] or [`Client::with_option`].
    ///
    /// # Note
    /// This does not take effect until the next `INSERT` statement begins
    /// if one is already in-progress.
    ///
    /// If you have already begun writing data, you may call [`Inserter::force_commit`]
    /// to end the current `INSERT` so this takes effect on the next call to [`Inserter::write`].
    ///
    /// [roles]: https://clickhouse.com/docs/operations/access-rights#role-management
    pub fn with_default_roles(mut self) -> Self {
        self.client.clear_roles();
        self
    }

    /// Similar to [`Client::with_option`], but for the INSERT statements
    /// generated by this [`Inserter`] only.
    ///
    /// # Note
    /// This does not take effect until the next `INSERT` statement begins
    /// if one is already in-progress.
    ///
    /// If you have already begun writing data, you may call [`Inserter::force_commit`]
    /// to end the current `INSERT` so this takes effect on the next call to [`Inserter::write`].
    pub fn with_option(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.client.add_option(name, value);
        self
    }

    /// See [`Inserter::with_timeouts()`].
    pub fn set_timeouts(&mut self, send_timeout: Option<Duration>, end_timeout: Option<Duration>) {
        self.send_timeout = send_timeout;
        self.end_timeout = end_timeout;
        if let Some(insert) = &mut self.insert {
            insert.set_timeouts(self.send_timeout, self.end_timeout);
        }
    }

    /// See [`Inserter::with_max_bytes()`].
    pub fn set_max_bytes(&mut self, threshold: u64) {
        self.max_bytes = threshold;
    }

    /// See [`Inserter::with_max_rows()`].
    pub fn set_max_rows(&mut self, threshold: u64) {
        self.max_rows = threshold;
    }

    /// See [`Inserter::with_period()`].
    pub fn set_period(&mut self, period: Option<Duration>) {
        self.ticks.set_period(period);
        self.ticks.reschedule();
    }

    /// See [`Inserter::with_period_bias()`].
    pub fn set_period_bias(&mut self, bias: f64) {
        self.ticks.set_period_bias(bias);
        self.ticks.reschedule();
    }

    /// Registers a callback that will be invoked after each successful batch commit.
    ///
    /// The callback receives the committed [`Quantities`]. It is invoked only
    /// when a batch actually commits (i.e., non-zero transactions), and only
    /// after the commit completes successfully.
    pub fn with_commit_callback(
        mut self,
        callback: impl FnMut(&Quantities) + Send + 'static,
    ) -> Self {
        self.on_commit = Some(Box::new(callback));
        self
    }

    /// How much time we have until the next tick.
    ///
    /// `None` if the period isn't configured.
    pub fn time_left(&mut self) -> Option<Duration> {
        self.ticks.time_left()
    }

    /// Returns statistics about data not yet inserted into ClickHouse.
    pub fn pending(&self) -> &Quantities {
        &self.pending
    }

    /// Serializes the provided row into an internal buffer.
    ///
    /// To check the limits and send the data to ClickHouse, call
    /// [`Inserter::commit()`].
    ///
    /// # Panics
    /// If called after the previous call that returned an error.
    #[inline]
    pub async fn write(&mut self, row: &T::Value<'_>) -> Result<()>
    where
        T: RowWrite,
    {
        if self.insert.is_none() {
            self.init_insert().await?;
        }

        match self.insert.as_mut().unwrap().do_write(row) {
            Ok(bytes) => {
                self.pending.bytes += bytes as u64;
                self.pending.rows += 1;

                if !self.in_transaction {
                    self.pending.transactions += 1;
                    self.in_transaction = true;
                }

                Ok(())
            }
            Err(err) => {
                self.pending = Quantities::ZERO;
                Err(err)
            }
        }
    }

    /// Checks limits and ends the current `INSERT` if they are reached.
    pub async fn commit(&mut self) -> Result<Quantities> {
        if !self.limits_reached() {
            self.in_transaction = false;
            return Ok(Quantities::ZERO);
        }

        self.force_commit().await
    }

    /// Ends the current `INSERT` unconditionally.
    pub async fn force_commit(&mut self) -> Result<Quantities> {
        let quantities = self.insert().await?;
        self.ticks.reschedule();
        Ok(quantities)
    }

    /// Ends the current `INSERT` and whole `Inserter` unconditionally.
    ///
    /// If it isn't called, the current `INSERT` is aborted.
    pub async fn end(mut self) -> Result<Quantities> {
        self.insert().await
    }

    fn limits_reached(&self) -> bool {
        self.pending.rows >= self.max_rows
            || self.pending.bytes >= self.max_bytes
            || self.ticks.reached()
    }

    async fn insert(&mut self) -> Result<Quantities> {
        self.in_transaction = false;
        let quantities = mem::replace(&mut self.pending, Quantities::ZERO);

        if let Some(insert) = self.insert.take() {
            insert.end().await?;
        }

        if let Some(cb) = &mut self.on_commit
            && quantities.transactions > 0
        {
            (cb)(&quantities);
        }

        Ok(quantities)
    }

    #[cold]
    #[inline(never)]
    async fn init_insert(&mut self) -> Result<()> {
        debug_assert!(self.insert.is_none());
        debug_assert_eq!(self.pending, Quantities::ZERO);

        let mut new_insert: Insert<T> = self.client.insert(&self.table).await?;
        new_insert.set_timeouts(self.send_timeout, self.end_timeout);
        self.insert = Some(new_insert);
        Ok(())
    }
}
