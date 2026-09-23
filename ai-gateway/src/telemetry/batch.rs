//! Pure grouping of mapped spans into per-project upload batches.
use std::{
    collections::{HashMap, hash_map::Entry},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use opentelemetry::trace::SpanContext;
use serde_json::Value;
use tokio::{sync::OwnedSemaphorePermit, time::Instant};

use super::Grant;

/// When a project's batch is handed to the uploader.
#[derive(Clone, Copy)]
pub(super) struct BatchPolicy {
    pub max_records: usize,
    pub max_bytes: usize,
    pub linger: Duration,
    /// Uploads start at least this long before the batch's grant expires.
    pub expiry_margin: Duration,
    /// Opening a batch beyond this many projects flushes the one due soonest.
    pub max_open: usize,
}

impl Default for BatchPolicy {
    fn default() -> Self {
        Self {
            max_records: 100,
            // Half the upload payload bound leaves room for one oversized span.
            max_bytes: 4 * 1024 * 1024,
            linger: Duration::from_secs(1),
            expiry_margin: Duration::from_secs(30),
            max_open: 256,
        }
    }
}

/// A mapped span waiting for upload. Its retained-bytes permit is released when the
/// span is uploaded, fails, or is dropped.
pub(super) struct Pending {
    pub span: Value,
    pub bytes: usize,
    /// The gateway request that produced the span, linked from the upload's trace.
    pub link: SpanContext,
    _retained: OwnedSemaphorePermit,
}

impl Pending {
    pub fn new(
        span: Value,
        bytes: usize,
        link: SpanContext,
        retained: OwnedSemaphorePermit,
    ) -> Self {
        Self {
            span,
            bytes,
            link,
            _retained: retained,
        }
    }
}

/// A project's spans, ready to upload with one grant.
pub(super) struct Flush {
    pub grant: Grant,
    pub items: Vec<Pending>,
}

struct Batch {
    /// The latest-expiring grant among the batched records; any of them authorizes the project.
    grant: Grant,
    items: Vec<Pending>,
    bytes: usize,
    opened: Instant,
    due: Instant,
}

impl Batch {
    fn open(grant: Grant, now: Instant, policy: &BatchPolicy) -> Self {
        let due = due_at(&grant, now, now, policy);
        Self {
            grant,
            items: Vec::new(),
            bytes: 0,
            opened: now,
            due,
        }
    }

    fn adopt_grant(&mut self, grant: Grant, now: Instant, policy: &BatchPolicy) {
        if grant.expires_at > self.grant.expires_at {
            self.due = due_at(&grant, self.opened, now, policy);
            self.grant = grant;
        }
    }

    fn into_flush(self) -> Flush {
        Flush {
            grant: self.grant,
            items: self.items,
        }
    }
}

/// The earlier of the linger deadline and the last safe moment to use the grant.
fn due_at(grant: &Grant, opened: Instant, now: Instant, policy: &BatchPolicy) -> Instant {
    let unix_now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let usable = Duration::from_secs(grant.expires_at)
        .saturating_sub(unix_now)
        .saturating_sub(policy.expiry_margin);
    (opened + policy.linger).min(now + usable.min(policy.linger))
}

pub(super) struct Batches {
    policy: BatchPolicy,
    open: HashMap<String, Batch>,
}

impl Batches {
    pub fn new(policy: BatchPolicy) -> Self {
        Self {
            policy,
            open: HashMap::new(),
        }
    }

    /// Add a span to its project's batch and return every batch that became ready.
    pub fn push_record(&mut self, grant: Grant, item: Pending, now: Instant) -> Vec<Flush> {
        let mut ready = Vec::new();
        let project = grant.project_id.clone();
        if self
            .open
            .get(&project)
            .is_some_and(|batch| batch.bytes + item.bytes > self.policy.max_bytes)
        {
            ready.extend(self.take_project(&project));
        }
        if !self.open.contains_key(&project) && self.open.len() >= self.policy.max_open {
            let soonest = self
                .open
                .iter()
                .min_by_key(|(_, batch)| batch.due)
                .map(|(project, _)| project.clone());
            if let Some(soonest) = soonest {
                ready.extend(self.take_project(&soonest));
            }
        }
        let policy = self.policy;
        let batch = match self.open.entry(project.clone()) {
            Entry::Occupied(entry) => {
                let batch = entry.into_mut();
                batch.adopt_grant(grant, now, &policy);
                batch
            }
            Entry::Vacant(entry) => entry.insert(Batch::open(grant, now, &policy)),
        };
        batch.bytes += item.bytes;
        batch.items.push(item);
        if batch.items.len() >= policy.max_records || batch.bytes >= policy.max_bytes {
            ready.extend(self.take_project(&project));
        }
        ready
    }

    /// Remove every batch whose linger or grant deadline has passed.
    pub fn take_due(&mut self, now: Instant) -> Vec<Flush> {
        self.open
            .extract_if(|_, batch| batch.due <= now)
            .map(|(_, batch)| batch.into_flush())
            .collect()
    }

    pub fn take_all(&mut self) -> Vec<Flush> {
        self.open
            .drain()
            .map(|(_, batch)| batch.into_flush())
            .collect()
    }

    /// The earliest moment an open batch becomes due, if any batch is open.
    pub fn next_due(&self) -> Option<Instant> {
        self.open.values().map(|batch| batch.due).min()
    }

    fn take_project(&mut self, project: &str) -> Option<Flush> {
        self.open.remove(project).map(Batch::into_flush)
    }
}

#[cfg(test)]
mod tests;
