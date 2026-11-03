use super::*;

#[test]
fn serves_until_failures_reach_the_threshold() {
    let breakers = CircuitBreakers::new(BreakerConfig {
        threshold: 3,
        cooldown: Duration::from_secs(60),
    });
    assert!(breakers.allows("conn-1"));
    breakers.record_failure("conn-1");
    assert!(breakers.allows("conn-1"));
    breakers.record_failure("conn-1");
    assert!(breakers.allows("conn-1"));
    breakers.record_failure("conn-1");
    assert!(!breakers.allows("conn-1"));
    // An unrelated connection is unaffected.
    assert!(breakers.allows("conn-2"));
}

#[test]
fn half_open_admits_a_probe_after_the_cooldown() {
    let breakers = CircuitBreakers::new(BreakerConfig {
        threshold: 1,
        cooldown: Duration::from_millis(10),
    });
    breakers.record_failure("conn-1");
    assert!(!breakers.allows("conn-1"));
    std::thread::sleep(Duration::from_millis(20));
    // The probe is admitted; a failing probe re-opens for another cooldown.
    assert!(breakers.allows("conn-1"));
    breakers.record_failure("conn-1");
    assert!(!breakers.allows("conn-1"));
    std::thread::sleep(Duration::from_millis(20));
    // A succeeding probe closes the breaker.
    assert!(breakers.allows("conn-1"));
    breakers.record_success("conn-1");
    assert!(breakers.allows("conn-1"));
    breakers.record_failure("conn-1");
    // Closed again: with threshold 1 the next failure re-opens it.
    assert!(!breakers.allows("conn-1"));
}

#[test]
fn concurrent_probes_are_admitted_while_half_open() {
    let breakers = CircuitBreakers::new(BreakerConfig {
        threshold: 1,
        cooldown: Duration::from_millis(10),
    });
    breakers.record_failure("conn-1");
    std::thread::sleep(Duration::from_millis(20));
    assert!(breakers.allows("conn-1"));
    // A second concurrent request also passes.
    assert!(breakers.allows("conn-1"));
}

#[test]
fn successes_reset_the_failure_count() {
    let breakers = CircuitBreakers::new(BreakerConfig {
        threshold: 2,
        cooldown: Duration::from_secs(60),
    });
    breakers.record_failure("conn-1");
    breakers.record_success("conn-1");
    breakers.record_failure("conn-1");
    assert!(breakers.allows("conn-1"));
}

#[test]
fn a_failure_while_open_keeps_the_breaker_open() {
    let breakers = CircuitBreakers::new(BreakerConfig {
        threshold: 3,
        cooldown: Duration::from_secs(60),
    });
    for _ in 0..3 {
        breakers.record_failure("conn-1");
    }
    assert!(!breakers.allows("conn-1"));
    // A request already in flight when the breaker opened fails late.
    breakers.record_failure("conn-1");
    assert!(!breakers.allows("conn-1"));
}
