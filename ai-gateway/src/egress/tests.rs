use super::*;
use std::str::FromStr;

fn exemptions(value: &str) -> EgressExemptions {
    EgressExemptions::parse(value).unwrap()
}

fn restricted() -> EgressPolicy {
    EgressPolicy::new(EgressExemptions::default(), true)
}

fn policy(value: &str) -> EgressPolicy {
    EgressPolicy::new(exemptions(value), true)
}

#[test]
fn public_ipv4_hosts_are_allowed() {
    assert!(restricted().allows_literal("93.184.216.34"));
    assert!(restricted().allows_literal("8.8.8.8"));
}

#[test]
fn private_and_reserved_addresses_are_blocked() {
    for host in [
        "10.3.24.39",
        "10.0.0.1",
        "172.16.0.1",
        "192.168.1.1",
        "127.0.0.1",
        "169.254.169.254", // cloud metadata endpoint
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "240.0.0.1",
        "198.51.100.7", // TEST-NET-3
    ] {
        assert!(!restricted().allows_literal(host), "{host} must be blocked");
    }
}

#[test]
fn private_ipv6_addresses_are_blocked() {
    for host in ["::1", "fe80::1", "fd00::1", "ff02::1", "::ffff:10.0.0.1"] {
        assert!(!restricted().allows_literal(host), "{host} must be blocked");
    }
    assert!(restricted().allows_literal("2606:4700::6810:85e5"));
}

#[test]
fn allows_literal_rejects_non_addresses() {
    // Names are checked by the resolver, not this gate.
    assert!(!restricted().allows_literal("api.openai.com"));
}

#[test]
fn unrestricted_policy_allows_everything() {
    let policy = EgressPolicy::new(EgressExemptions::default(), false);
    assert!(policy.allows_literal("127.0.0.1"));
    assert!(policy.allows_literal("10.0.0.1"));
}

#[test]
fn range_exemptions_allow_private_addresses() {
    assert!(policy("10.3.24.39").allows_literal("10.3.24.39"));
    assert!(!policy("10.3.24.39").allows_literal("10.3.24.40"));

    let policy = policy("10.3.24.0/23");
    assert!(policy.allows_literal("10.3.24.39"));
    assert!(policy.allows_literal("10.3.25.1"));
    assert!(!policy.allows_literal("10.3.26.1"));
}

#[test]
fn loopback_is_blocked_even_when_exempted() {
    let policy = policy("127.0.0.1,10.0.0.0/8");
    assert!(!policy.allows_literal("127.0.0.1"));
    assert!(!policy.allows_literal("127.5.5.5"));
    assert!(policy.allows_literal("10.1.2.3"));
}

#[test]
fn zero_prefix_exempts_the_whole_family() {
    assert!(policy("0.0.0.0/0").allows_literal("10.3.24.39"));
    assert!(policy("0.0.0.0/0").allows_literal("172.16.0.1"));
    assert!(!policy("::/0").allows_literal("10.3.24.39"));
    assert!(policy("::/0").allows_literal("fd00::1"));
    assert!(!policy("::/0").allows_literal("::1"));
}

#[test]
fn parse_rejects_malformed_entries() {
    assert!(EgressExemptions::parse("10.0.0.0/33").is_err());
    assert!(EgressExemptions::parse("not an ip/24").is_err());
    assert!(EgressExemptions::parse("10.0.0.0//8").is_err());
    assert!(EgressExemptions::parse("::1/129").is_err());
    assert!(EgressExemptions::parse("10.0.0.0, 10.1.0.0/8, proxy.internal").is_ok());
    assert!(EgressExemptions::parse("").is_ok());
    assert!(EgressExemptions::parse("  ").is_ok());
}

#[test]
fn bracketed_ipv6_exemptions_allow_the_literal() {
    let policy = policy("[fd00::1]");
    assert!(policy.allows_literal("fd00::1"));
    assert!(!policy.allows_literal("fd00::2"));
}

#[tokio::test]
async fn resolver_keeps_only_permitted_addresses() {
    // A name resolving only to loopback is an error, not an empty answer.
    let resolver = EgressResolver::new(restricted());
    let name = Name::from_str("localhost").unwrap();
    // Public resolution depends on the environment, so only loopback is asserted.
    let result = Resolve::resolve(&resolver, name).await;
    assert!(result.is_err());
}

#[test]
fn hostname_exemptions_apply_to_resolved_addresses() {
    let policy = policy("internal.corp");
    assert!(policy.allows_resolved("internal.corp", "10.3.24.39".parse().unwrap()));
    assert!(!policy.allows_resolved("other.corp", "10.3.24.39".parse().unwrap()));
}

#[test]
fn resolved_policy_blocks_unlisted_private_addresses() {
    let policy = restricted();
    assert!(!policy.allows_resolved("internal.corp", "10.3.24.39".parse().unwrap()));
    assert!(policy.allows_resolved("api.openai.com", "93.184.216.34".parse().unwrap()));
}

#[test]
fn loopback_stays_blocked_under_catch_all_exemptions() {
    let policy = policy("0.0.0.0/0,::/0");
    for host in ["0.0.0.0", "::", "::ffff:127.0.0.1", "127.0.0.1", "::1"] {
        assert!(!policy.allows_literal(host), "{host} must stay blocked");
    }
    assert!(policy.allows_literal("10.0.0.1"));
}

#[test]
fn ipv6_forms_that_reach_ipv4_hosts_are_blocked() {
    for host in [
        "64:ff9b::a00:5",  // NAT64 well-known prefix to 10.0.0.5
        "64:ff9b::7f00:1", // NAT64 to 127.0.0.1
        "2002:a00:5::1",   // 6to4 relay for 10.0.0.5
        "2002:7f00:1::1",  // 6to4 relay for 127.0.0.1
        "64:ff9b:1::1",    // local-use NAT64
        "2001::1",         // Teredo
        "::a00:5",         // IPv4-compatible 10.0.0.5
        "fec0::1",         // site-local
    ] {
        assert!(!restricted().allows_literal(host), "{host} must be blocked");
        assert!(
            !restricted().allows_resolved("upstream.example", host.parse().unwrap()),
            "{host} must be blocked when resolved"
        );
    }
    // NAT64 to a public address reaches that public host.
    assert!(restricted().allows_literal("64:ff9b::808:808"));
}

#[test]
fn embedded_ipv4_hosts_follow_the_ipv4_exemptions() {
    let policy = policy("10.0.0.0/8,0.0.0.0/0");
    assert!(policy.allows_literal("64:ff9b::a00:5"));
    assert!(policy.allows_literal("2002:a00:5::1"));
    // Loopback stays closed however it is embedded.
    assert!(!policy.allows_literal("64:ff9b::7f00:1"));
    assert!(!policy.allows_literal("2002:7f00:1::1"));
}

#[derive(Clone, Default)]
struct LogWriter(std::sync::Arc<std::sync::Mutex<Vec<u8>>>);
impl std::io::Write for LogWriter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for LogWriter {
    type Writer = Self;
    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}

#[tokio::test]
async fn resolver_logs_a_policy_refusal_for_operators() {
    let writer = LogWriter::default();
    let subscriber = tracing_subscriber::fmt()
        .json()
        .with_writer(writer.clone())
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);
    let resolver = EgressResolver::new(restricted());
    let result = Resolve::resolve(&resolver, Name::from_str("localhost").unwrap()).await;
    assert!(result.is_err());
    let logs = String::from_utf8(writer.0.lock().unwrap().clone()).unwrap();
    assert!(logs.contains("egress_blocked"), "{logs}");
    assert!(logs.contains("localhost"), "{logs}");
}
