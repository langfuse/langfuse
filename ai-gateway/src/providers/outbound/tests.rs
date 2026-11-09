use super::*;

fn url(value: &str) -> Url {
    Url::parse(value).unwrap()
}

fn addrs(ips: &[&str]) -> Vec<SocketAddr> {
    ips.iter()
        .map(|ip| SocketAddr::new(ip.parse().unwrap(), 443))
        .collect()
}

#[test]
fn allows_public_hosts_and_addresses_by_default() {
    let policy = OutboundPolicy::default();
    assert_eq!(policy.check_url(&url("https://llm.example.com/v1")), Ok(()));
    assert_eq!(policy.check_url(&url("http://8.8.8.8/v1")), Ok(()));
    assert_eq!(
        policy.check_resolved(
            "llm.example.com",
            &addrs(&["93.184.216.34", "2606:2800::1"])
        ),
        Ok(())
    );
}

#[test]
fn rejects_non_http_urls_and_credentials() {
    let policy = OutboundPolicy::default();
    for value in [
        "ftp://llm.example.com/v1",
        "https://user:pass@llm.example.com/v1",
    ] {
        assert_eq!(
            policy.check_url(&url(value)),
            Err(OutboundError::Url),
            "{value}"
        );
    }
}

#[test]
fn https_requirement_rejects_plain_http() {
    let policy = OutboundPolicy {
        require_https: true,
        ..OutboundPolicy::default()
    };
    assert_eq!(
        policy.check_url(&url("http://llm.example.com/v1")),
        Err(OutboundError::Url)
    );
    assert_eq!(policy.check_url(&url("https://llm.example.com/v1")), Ok(()));
}

#[test]
fn rejects_internal_hostnames() {
    let policy = OutboundPolicy::default();
    for value in [
        "http://localhost:8080",
        "http://api.localhost",
        "http://metadata.google.internal",
        "http://service.internal",
        "http://host.docker.internal",
    ] {
        assert_eq!(
            policy.check_url(&url(value)),
            Err(OutboundError::Host),
            "{value}"
        );
    }
}

#[test]
fn rejects_private_and_metadata_addresses() {
    let policy = OutboundPolicy::default();
    for value in [
        "http://127.0.0.1",
        "http://10.1.2.3",
        "http://169.254.169.254",
        "http://[::1]",
        "http://[fd00:ec2::254]",
        "http://[::ffff:10.0.0.1]",
    ] {
        assert_eq!(
            policy.check_url(&url(value)),
            Err(OutboundError::Address),
            "{value}"
        );
    }
}

#[test]
fn rejects_a_host_when_any_resolved_address_is_private() {
    let policy = OutboundPolicy::default();
    assert_eq!(
        policy.check_resolved("rebind.example.com", &addrs(&["93.184.216.34", "10.0.0.5"])),
        Err(OutboundError::Address)
    );
    assert_eq!(
        policy.check_resolved("rebind.example.com", &[]),
        Err(OutboundError::Resolution)
    );
}

#[test]
fn whitelists_exempt_private_targets() {
    let policy = OutboundPolicy {
        whitelisted_hosts: vec!["llm.corp".to_owned()],
        whitelisted_ips: vec!["10.0.0.5".parse().unwrap()],
        whitelisted_ranges: vec!["192.168.10.0/24".parse().unwrap()],
        ..OutboundPolicy::default()
    };
    assert_eq!(
        policy.check_resolved("llm.corp", &addrs(&["10.9.9.9"])),
        Ok(())
    );
    assert_eq!(policy.check_url(&url("http://10.0.0.5:4000")), Ok(()));
    assert_eq!(
        policy.check_resolved("proxy.example.com", &addrs(&["192.168.10.7"])),
        Ok(())
    );
    assert_eq!(
        policy.check_resolved("proxy.example.com", &addrs(&["192.168.11.7"])),
        Err(OutboundError::Address)
    );
}

#[test]
fn allowed_hosts_restrict_every_destination() {
    let policy = OutboundPolicy {
        allowed_hosts: vec!["llm.corp".to_owned()],
        ..OutboundPolicy::default()
    };
    assert_eq!(
        policy.check_resolved("llm.corp", &addrs(&["10.0.0.5"])),
        Ok(())
    );
    assert_eq!(
        policy.check_url(&url("https://api.openai.com/v1")),
        Err(OutboundError::Host)
    );
}

#[test]
fn operator_blocked_ranges_apply_to_public_addresses() {
    let policy = OutboundPolicy {
        blocked_ranges: vec!["93.184.216.0/24".parse().unwrap()],
        ..OutboundPolicy::default()
    };
    assert_eq!(
        policy.check_resolved("llm.example.com", &addrs(&["93.184.216.34"])),
        Err(OutboundError::Address)
    );
}
