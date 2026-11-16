//! SSRF policy for provider requests, matching Web's LLM connection base URL checks.
use std::{
    net::{IpAddr, SocketAddr},
    str::FromStr,
    sync::{Arc, LazyLock},
};

use ipnet::IpNet;
use reqwest::{
    Url,
    dns::{Addrs, Name, Resolve, Resolving},
};
use url::Host;

const BLOCKED_HOSTNAMES: &[&str] = &[
    "localhost",
    "internal",
    "intranet",
    "metadata.google.internal",
    "host.docker.internal",
    "gateway.docker.internal",
];
/// Hostnames under these names are blocked as well as the names themselves.
const BLOCKED_HOSTNAME_SUFFIXES: &[&str] = &["localhost", "internal", "intranet"];

/// Kept in sync with Web's static deny-list (`webhooks/ipBlocking.ts`).
const BLOCKED_CIDRS: &[&str] = &[
    "0.0.0.0/8",
    "10.0.0.0/8",
    "100.64.0.0/10",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "172.16.0.0/12",
    "192.0.0.0/29",
    "192.0.2.0/24",
    "192.168.0.0/16",
    "198.18.0.0/15",
    "198.51.100.0/24",
    "203.0.113.0/24",
    "224.0.0.0/4",
    "240.0.0.0/4",
    "255.255.255.255/32",
    "::/128",
    "::1/128",
    "::ffff:0:0/96",
    "fc00::/7",
    "fe80::/10",
    "ff00::/8",
    "100::/64",
    "64:ff9b::/96",
    "64:ff9b:1::/48",
    "::/96",
    "2001::/32",
    "2001:db8::/32",
    "2002::/16",
];

static BLOCKED_NETWORKS: LazyLock<Vec<IpNet>> = LazyLock::new(|| {
    BLOCKED_CIDRS
        .iter()
        .filter_map(|cidr| IpNet::from_str(cidr).ok())
        .collect()
});

/// Where provider requests may go. Self-hosted deployments open private targets with
/// the same environment variables Web reads for LLM connections.
#[derive(Debug, Clone, Default)]
pub struct OutboundPolicy {
    /// Exempt from the private-address block (`LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST`).
    pub whitelisted_hosts: Vec<String>,
    pub whitelisted_ips: Vec<IpAddr>,
    pub whitelisted_ranges: Vec<IpNet>,
    /// When non-empty, the only hosts requests may use (`LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS`).
    pub allowed_hosts: Vec<String>,
    pub blocked_ranges: Vec<IpNet>,
    /// Langfuse Cloud accepts only HTTPS provider URLs, as Web does on save.
    pub require_https: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub(crate) enum OutboundError {
    #[error("provider URL is not an HTTP URL")]
    Url,
    #[error("provider host is not allowed")]
    Host,
    #[error("provider address is not allowed")]
    Address,
    #[error("provider host did not resolve")]
    Resolution,
}

impl OutboundPolicy {
    /// Checks the URL before sending. IP-literal hosts never reach the resolver, so
    /// this is their only address check.
    pub(crate) fn check_url(&self, url: &Url) -> Result<(), OutboundError> {
        let is_allowed_scheme = match url.scheme() {
            "https" => true,
            "http" => !self.require_https,
            _ => false,
        };
        if !is_allowed_scheme || !url.username().is_empty() || url.password().is_some() {
            return Err(OutboundError::Url);
        }
        match url.host() {
            Some(Host::Domain(domain)) => self.check_host(domain).map(|_| ()),
            Some(Host::Ipv4(ip)) => self.check_literal(&ip.to_string(), IpAddr::V4(ip)),
            Some(Host::Ipv6(ip)) => self.check_literal(&ip.to_string(), IpAddr::V6(ip)),
            None => Err(OutboundError::Url),
        }
    }

    /// Official origins and Bedrock skip the address checks because they may
    /// resolve to private VPC-endpoint addresses, but the allowlist still binds them.
    pub(crate) fn check_allowed_host(&self, url: &Url) -> Result<(), OutboundError> {
        let host = match url.host() {
            Some(Host::Domain(domain)) => domain.to_owned(),
            Some(Host::Ipv4(ip)) => ip.to_string(),
            Some(Host::Ipv6(ip)) => ip.to_string(),
            None => return Err(OutboundError::Url),
        };
        self.check_allowlist(&host).map(|_| ())
    }

    /// Mirrors Web's positive allowlist: when configured, a listed host is
    /// trusted and any other host is rejected.
    fn check_allowlist(&self, host: &str) -> Result<Allowlist, OutboundError> {
        if self.allowed_hosts.is_empty() {
            Ok(Allowlist::NotConfigured)
        } else if self.allowed_hosts.iter().any(|allowed| allowed == host) {
            Ok(Allowlist::Allowed)
        } else {
            Err(OutboundError::Host)
        }
    }

    fn check_literal(&self, host: &str, ip: IpAddr) -> Result<(), OutboundError> {
        match self.check_host(host)? {
            HostDecision::Trusted => Ok(()),
            HostDecision::CheckAddresses => self.check_ip(ip),
        }
    }

    /// Every resolved address must pass, so one private record fails the request
    /// rather than leaving the connector to pick it.
    pub(crate) fn check_resolved(
        &self,
        host: &str,
        addrs: &[SocketAddr],
    ) -> Result<(), OutboundError> {
        if addrs.is_empty() {
            return Err(OutboundError::Resolution);
        }
        if self.check_host(host)? == HostDecision::Trusted {
            return Ok(());
        }
        addrs.iter().try_for_each(|addr| self.check_ip(addr.ip()))
    }

    fn check_host(&self, host: &str) -> Result<HostDecision, OutboundError> {
        if self.check_allowlist(host)? == Allowlist::Allowed {
            return Ok(HostDecision::Trusted);
        }
        if self.whitelisted_hosts.iter().any(|allowed| allowed == host) {
            return Ok(HostDecision::Trusted);
        }
        let blocked = BLOCKED_HOSTNAMES.contains(&host)
            || BLOCKED_HOSTNAME_SUFFIXES.iter().any(|suffix| {
                host.strip_suffix(suffix)
                    .is_some_and(|rest| rest.ends_with('.'))
            });
        if blocked {
            return Err(OutboundError::Host);
        }
        Ok(HostDecision::CheckAddresses)
    }

    fn check_ip(&self, ip: IpAddr) -> Result<(), OutboundError> {
        if self.whitelisted_ips.contains(&ip)
            || self
                .whitelisted_ranges
                .iter()
                .any(|range| range.contains(&ip))
        {
            return Ok(());
        }
        if self
            .blocked_ranges
            .iter()
            .chain(BLOCKED_NETWORKS.iter())
            .any(|range| range.contains(&ip))
        {
            return Err(OutboundError::Address);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Allowlist {
    NotConfigured,
    Allowed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HostDecision {
    /// Listed by the operator; its addresses are not checked.
    Trusted,
    CheckAddresses,
}

/// Validates addresses where the connection is made, so a host cannot pass a check
/// and then resolve somewhere else (DNS rebinding).
pub(crate) struct PolicyResolver(pub(crate) Arc<OutboundPolicy>);

impl Resolve for PolicyResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let policy = Arc::clone(&self.0);
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let addrs: Vec<SocketAddr> =
                tokio::net::lookup_host((host.as_str(), 0)).await?.collect();
            if let Err(error) = policy.check_resolved(&host, &addrs) {
                tracing::warn!(host, %error, "blocked provider destination");
                return Err(error.into());
            }
            let addrs: Addrs = Box::new(addrs.into_iter());
            Ok(addrs)
        })
    }
}

#[cfg(test)]
mod tests;
