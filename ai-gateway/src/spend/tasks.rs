//! Background spend work: counter writes and limit reports outlive the request
//! that started them. They are capped, so a Redis outage cannot pile up tasks,
//! and drained on shutdown, so a stopping gateway does not drop recorded spend.
use std::{
    future::Future,
    sync::{Arc, Mutex, PoisonError},
};

use tokio::{
    sync::Semaphore,
    task::JoinSet,
    time::{Instant, timeout_at},
};

/// A task retries for about five seconds while Redis is unavailable, so this
/// covers a few thousand requests per second through an outage.
const MAX_IN_FLIGHT: usize = 10_000;

pub(super) struct TaskTracker {
    tasks: Mutex<JoinSet<()>>,
    permits: Arc<Semaphore>,
}

impl Default for TaskTracker {
    fn default() -> Self {
        Self {
            tasks: Mutex::new(JoinSet::new()),
            permits: Arc::new(Semaphore::new(MAX_IN_FLIGHT)),
        }
    }
}

impl TaskTracker {
    /// Runs `task` in the background. Returns false, dropping the task, when too
    /// many are in flight or no runtime is running.
    pub(super) fn spawn(&self, task: impl Future<Output = ()> + Send + 'static) -> bool {
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return false;
        };
        let Ok(permit) = Arc::clone(&self.permits).try_acquire_owned() else {
            return false;
        };
        let mut tasks = self.tasks.lock().unwrap_or_else(PoisonError::into_inner);
        while tasks.try_join_next().is_some() {}
        tasks.spawn_on(
            async move {
                task.await;
                drop(permit);
            },
            &runtime,
        );
        true
    }

    /// Waits for running tasks until `deadline`; tasks still running then are abandoned.
    pub(super) async fn shutdown(&self, deadline: Instant) {
        let mut tasks =
            std::mem::take(&mut *self.tasks.lock().unwrap_or_else(PoisonError::into_inner));
        let pending = tasks.len();
        let drained = timeout_at(deadline, async {
            while tasks.join_next().await.is_some() {}
        })
        .await;
        if drained.is_err() {
            tracing::warn!(
                pending,
                abandoned = tasks.len(),
                "spend tasks did not finish before shutdown"
            );
        }
    }
}
