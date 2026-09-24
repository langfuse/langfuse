use std::{
    collections::{HashMap, hash_map::Entry},
    time::Duration,
};

use opentelemetry::trace::SpanContext;
use serde_json::Value;
use tokio::{sync::OwnedSemaphorePermit, time::Instant};

use super::Grant;

#[derive(Clone, Copy)]
pub(super) struct BatchPolicy {
    pub max_records: usize,
    pub max_bytes: usize,
    pub linger: Duration,
    pub expiry_margin: Duration,
    pub max_open: usize,
}

impl Default for BatchPolicy {
    fn default() -> Self {
        Self {
            max_records: 100,
            max_bytes: 4 * 1024 * 1024,
            linger: Duration::from_secs(1),
            expiry_margin: Duration::from_secs(30),
            max_open: 256,
        }
    }
}

pub(super) struct Pending {
    pub span: Value,
    pub bytes: usize,
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

pub(super) struct Flush {
    pub grant: Grant,
    pub items: Vec<Pending>,
}

struct Batch {
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

fn due_at(grant: &Grant, opened: Instant, now: Instant, policy: &BatchPolicy) -> Instant {
    let usable = grant.remaining().saturating_sub(policy.expiry_margin);
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

    pub fn next_due(&self) -> Option<Instant> {
        self.open.values().map(|batch| batch.due).min()
    }

    fn take_project(&mut self, project: &str) -> Option<Flush> {
        self.open.remove(project).map(Batch::into_flush)
    }
}

#[cfg(test)]
mod tests;
