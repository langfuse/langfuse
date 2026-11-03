use std::time::Duration;

use super::*;

const GRANT: Duration = Duration::from_mins(15);

fn status(status: u16) -> ExportError {
    ExportError::Rejected {
        status,
        retry_after: None,
    }
}

#[test]
fn transient_failures_back_off_four_times_longer_within_the_upper_half() {
    let policy = RetryPolicy::default();
    for (attempt, low_ms, high_ms) in [(1, 250, 500), (2, 1_000, 2_000)] {
        let low = Duration::from_millis(low_ms);
        let high = Duration::from_millis(high_ms);
        assert_eq!(
            policy.backoff(attempt, &ExportError::Transport, GRANT, 0),
            Some(low)
        );
        let spread = (high_ms - low_ms) * 1_000_000;
        assert_eq!(
            policy.backoff(attempt, &ExportError::Transport, GRANT, spread),
            Some(high)
        );
        for random in [1, 7_777_777, u64::MAX] {
            let delay = policy
                .backoff(attempt, &ExportError::Transport, GRANT, random)
                .unwrap();
            assert!((low..=high).contains(&delay), "{delay:?}");
        }
    }
    assert_eq!(policy.backoff(3, &ExportError::Transport, GRANT, 0), None);
}

#[test]
fn only_failures_that_a_resend_can_fix_are_retried() {
    let policy = RetryPolicy::default();
    for error in [
        status(408),
        status(429),
        status(500),
        status(502),
        status(503),
        status(504),
    ] {
        assert!(policy.backoff(1, &error, GRANT, 0).is_some(), "{error:?}");
    }
    for error in [
        status(307),
        status(400),
        status(401),
        status(403),
        status(413),
        status(501),
        ExportError::Expired,
        ExportError::Payload,
        ExportError::Response,
        ExportError::Partial,
    ] {
        assert_eq!(policy.backoff(1, &error, GRANT, 0), None, "{error:?}");
    }
}

#[test]
fn retry_after_extends_the_backoff_but_never_beyond_the_maximum_wait() {
    let policy = RetryPolicy::default();
    let throttled = |seconds| ExportError::Rejected {
        status: 429,
        retry_after: Some(Duration::from_secs(seconds)),
    };
    assert_eq!(
        policy.backoff(1, &throttled(7), GRANT, 0),
        Some(Duration::from_secs(7))
    );
    assert_eq!(
        policy.backoff(1, &throttled(0), GRANT, 0),
        Some(Duration::from_millis(250))
    );
    assert_eq!(policy.backoff(1, &throttled(11), GRANT, 0), None);
}

#[test]
fn retries_stop_when_the_grant_would_expire_before_the_resend() {
    let policy = RetryPolicy::default();
    let throttled = ExportError::Rejected {
        status: 503,
        retry_after: Some(Duration::from_secs(5)),
    };
    assert_eq!(
        policy.backoff(1, &throttled, Duration::from_secs(6), 0),
        Some(Duration::from_secs(5))
    );
    assert_eq!(
        policy.backoff(1, &throttled, Duration::from_millis(5_999), 0),
        None
    );
}
