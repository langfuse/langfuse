use std::{
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use opentelemetry::trace::SpanContext;
use serde_json::json;
use tokio::{sync::Semaphore, time::Instant};

use super::*;

const LINGER: Duration = Duration::from_secs(1);

fn policy() -> BatchPolicy {
    BatchPolicy {
        max_records: 3,
        max_bytes: 100,
        linger: LINGER,
        expiry_margin: Duration::from_secs(30),
        max_open: 2,
    }
}

fn grant(project: &str, token: &str, expires_in: u64) -> Grant {
    let unix_now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    Grant {
        project_id: project.into(),
        access_token: token.into(),
        expires_at: unix_now + expires_in,
    }
}

fn item(bytes: usize) -> Pending {
    let permit = Arc::new(Semaphore::new(1)).try_acquire_owned().unwrap();
    Pending::new(json!({}), bytes, SpanContext::empty_context(), permit)
}

fn projects(flushes: &[Flush]) -> Vec<(&str, usize)> {
    let mut projects: Vec<_> = flushes
        .iter()
        .map(|flush| (flush.grant.project_id.as_str(), flush.items.len()))
        .collect();
    projects.sort_unstable();
    projects
}

#[test]
fn reaching_the_record_limit_flushes_only_that_project() {
    let mut batches = Batches::new(policy());
    let now = Instant::now();
    for _ in 0..2 {
        assert!(
            batches
                .push_record(grant("a", "t", 900), item(1), now)
                .is_empty()
        );
    }
    assert!(
        batches
            .push_record(grant("b", "t", 900), item(1), now)
            .is_empty()
    );
    let ready = batches.push_record(grant("a", "t", 900), item(1), now);
    assert_eq!(projects(&ready), [("a", 3)]);
    assert_eq!(projects(&batches.take_all()), [("b", 1)]);
}

#[test]
fn a_span_that_would_overflow_the_byte_limit_starts_a_new_batch() {
    let mut batches = Batches::new(policy());
    let now = Instant::now();
    assert!(
        batches
            .push_record(grant("a", "t", 900), item(60), now)
            .is_empty()
    );
    let ready = batches.push_record(grant("a", "t", 900), item(60), now);
    assert_eq!(projects(&ready), [("a", 1)]);
    assert_eq!(projects(&batches.take_all()), [("a", 1)]);
}

#[test]
fn a_span_at_the_byte_limit_is_uploaded_alone() {
    let mut batches = Batches::new(policy());
    let ready = batches.push_record(grant("a", "t", 900), item(150), Instant::now());
    assert_eq!(projects(&ready), [("a", 1)]);
    assert!(batches.next_due().is_none());
}

#[test]
fn batches_become_due_after_the_linger() {
    let mut batches = Batches::new(policy());
    let now = Instant::now();
    batches.push_record(grant("a", "t", 900), item(1), now);
    batches.push_record(grant("b", "t", 900), item(1), now + LINGER / 2);
    assert_eq!(batches.next_due(), Some(now + LINGER));
    assert!(batches.take_due(now + LINGER / 2).is_empty());
    assert_eq!(projects(&batches.take_due(now + LINGER)), [("a", 1)]);
    assert_eq!(batches.next_due(), Some(now + LINGER + LINGER / 2));
}

#[test]
fn grants_close_to_expiry_are_used_immediately() {
    let mut batches = Batches::new(policy());
    let now = Instant::now();
    batches.push_record(grant("a", "t", 10), item(1), now);
    assert_eq!(batches.next_due(), Some(now));
}

#[test]
fn a_later_expiring_grant_replaces_the_batch_grant() {
    let mut batches = Batches::new(BatchPolicy {
        max_records: 10,
        ..policy()
    });
    let now = Instant::now();
    batches.push_record(grant("a", "soon", 10), item(1), now);
    batches.push_record(grant("a", "later", 900), item(1), now);
    assert_eq!(batches.next_due(), Some(now + LINGER));
    batches.push_record(grant("a", "earlier", 5), item(1), now);
    let flush = batches.take_all().pop().unwrap();
    assert_eq!(flush.grant.access_token, "later");
}

#[test]
fn opening_beyond_the_project_limit_flushes_the_batch_due_soonest() {
    let mut batches = Batches::new(policy());
    let now = Instant::now();
    batches.push_record(grant("a", "t", 900), item(1), now + LINGER / 2);
    batches.push_record(grant("b", "t", 900), item(1), now);
    let ready = batches.push_record(grant("c", "t", 900), item(1), now + LINGER / 2);
    assert_eq!(projects(&ready), [("b", 1)]);
    assert_eq!(projects(&batches.take_all()), [("a", 1), ("c", 1)]);
}
