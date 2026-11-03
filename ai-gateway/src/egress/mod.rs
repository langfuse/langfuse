//! Outbound policy for provider connections: private and reserved addresses
//! are refused at connect time unless the operator exempts them.
use std::{
    collections::HashSet,
    mem::size_of,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
};

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use tokio::net::lookup_host;

/// The built-in private and reserved ranges, in addition to operator-supplied ones.
const RESTRICTED_V4: &[(Ipv4Addr, u8)] = &[
    (Ipv4Addr::UNSPECIFIED, 8),           // 0.0.0.0/8
    (Ipv4Addr::new(10, 0, 0, 0), 8),      // RFC 1918
    (Ipv4Addr::new(100, 64, 0, 0), 10),   // RFC 6598 shared address space
    (Ipv4Addr::new(127, 0, 0, 0), 8),     // loopback
    (Ipv4Addr::new(169, 254, 0, 0), 16),  // link-local
    (Ipv4Addr::new(172, 16, 0, 0), 12),   // RFC 1918
    (Ipv4Addr::new(192, 0, 0, 0), 24),    // RFC 7912 IETF protocol assignments
    (Ipv4Addr::new(192, 0, 2, 0), 24),    // TEST-NET-1
    (Ipv4Addr::new(192, 88, 99, 0), 24),  // RFC 7534 anycast
    (Ipv4Addr::new(192, 168, 0, 0), 16),  // RFC 1918
    (Ipv4Addr::new(198, 18, 0, 0), 15),   // RFC 2544 benchmarking
    (Ipv4Addr::new(198, 51, 100, 0), 24), // TEST-NET-2
    (Ipv4Addr::new(203, 0, 113, 0), 24),  // TEST-NET-3
    (Ipv4Addr::new(224, 0, 0, 0), 4),     // multicast
    (Ipv4Addr::new(240, 0, 0, 0), 4),     // reserved
];

const RESTRICTED_V6: &[(Ipv6Addr, u8)] = &[
    (Ipv6Addr::UNSPECIFIED, 128),                        // ::
    (Ipv6Addr::LOCALHOST, 128),                          // ::1
    (Ipv6Addr::new(0, 0, 0, 0, 0, 0xffff, 0, 0), 96),    // IPv4-mapped
    (Ipv6Addr::UNSPECIFIED, 96),                         // IPv4-compatible (deprecated)
    (Ipv6Addr::new(0x64, 0xff9b, 1, 0, 0, 0, 0, 0), 48), // RFC 8215 local-use NAT64
    (Ipv6Addr::new(0x2001, 0, 0, 0, 0, 0, 0, 0), 32),    // Teredo
    (Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 0), 10),    // link-local
    (Ipv6Addr::new(0xfec0, 0, 0, 0, 0, 0, 0, 0), 10),    // site-local (deprecated)
    (Ipv6Addr::new(0xfc00, 0, 0, 0, 0, 0, 0, 0), 7),     // ULA
    (Ipv6Addr::new(0xff00, 0, 0, 0, 0, 0, 0, 0), 8),     // multicast
];

/// The hosts and CIDR ranges the operator exempts from the private-address block.
#[derive(Clone, Debug, Default)]
pub struct EgressExemptions {
    hosts: HashSet<String>,
    ranges: Vec<(IpAddr, u8)>,
}

impl EgressExemptions {
    /// Parse a comma-separated list of hostnames, IP addresses, and CIDR ranges.
    ///
    /// # Errors
    /// Returns the entry that is neither a valid host, IP address, nor CIDR range.
    pub fn parse(value: &str) -> Result<Self, String> {
        let mut exemptions = Self::default();
        for entry in value.split(',') {
            let entry = entry.trim();
            if entry.is_empty() {
                continue;
            }
            if let Some((address, prefix)) = entry.split_once('/') {
                let Ok(address): Result<IpAddr, _> = address.trim().parse() else {
                    return Err(entry.to_owned());
                };
                let Ok(prefix) = prefix.trim().parse::<u8>() else {
                    return Err(entry.to_owned());
                };
                let max_prefix = match address {
                    IpAddr::V4(_) => 32,
                    IpAddr::V6(_) => 128,
                };
                if prefix > max_prefix {
                    return Err(entry.to_owned());
                }
                exemptions.ranges.push((address, prefix));
            } else if let Ok(address) = entry.trim_matches(['[', ']']).parse::<IpAddr>() {
                // A bare or bracketed IP is a /32 or /128 range.
                exemptions.ranges.push((
                    address,
                    match address {
                        IpAddr::V4(_) => 32,
                        IpAddr::V6(_) => 128,
                    },
                ));
            } else {
                exemptions.hosts.insert(entry.to_ascii_lowercase());
            }
        }
        Ok(exemptions)
    }

    /// Whether `address`, resolved for `name`, is exempt by name or by range.
    fn exempts(&self, name: &str, address: IpAddr) -> bool {
        self.hosts.contains(name) || matches_range(&self.ranges, address)
    }
}

fn matches_range(ranges: &[(IpAddr, u8)], address: IpAddr) -> bool {
    ranges.iter().any(|(range, prefix)| match (range, address) {
        (IpAddr::V4(range), IpAddr::V4(address)) => {
            prefix_matches(u32::from(*range), u32::from(address), *prefix)
        }
        (IpAddr::V6(range), IpAddr::V6(address)) => {
            prefix_matches(u128::from(*range), u128::from(address), *prefix)
        }
        _ => false,
    })
}

/// `/0` exempts the whole family; the prefix shift would otherwise overflow.
fn prefix_matches<T: Copy + PartialEq + std::ops::Shr<u8, Output = T>>(
    range: T,
    address: T,
    prefix: u8,
) -> bool {
    if prefix == 0 {
        return true;
    }
    let width = u8::try_from(8 * size_of::<T>()).unwrap_or(u8::MAX);
    range >> (width - prefix) == address >> (width - prefix)
}

/// The operator exemptions, shared by literal checks and the resolver.
#[derive(Clone, Debug, Default)]
pub(crate) struct EgressPolicy {
    exemptions: EgressExemptions,
    restrict_private_addresses: bool,
}

impl EgressPolicy {
    pub(crate) fn new(exemptions: EgressExemptions, restrict_private_addresses: bool) -> Self {
        Self {
            exemptions,
            restrict_private_addresses,
        }
    }

    /// Whether the gateway may contact an IP-literal origin.
    pub(crate) fn allows_literal(&self, host: &str) -> bool {
        if !self.restrict_private_addresses {
            return true;
        }
        let Ok(address) = host.trim_matches(['[', ']']).parse::<IpAddr>() else {
            return false;
        };
        self.allows_address(None, address)
    }

    /// Whether the gateway may contact `address`, resolved for `name`.
    pub(crate) fn allows_resolved(&self, name: &str, address: IpAddr) -> bool {
        if !self.restrict_private_addresses {
            return true;
        }
        self.allows_address(Some(name), address)
    }

    fn allows_address(&self, name: Option<&str>, address: IpAddr) -> bool {
        // Mapped, NAT64 and 6to4 addresses are judged by the IPv4 host they
        // reach. Loopback and the unspecified address (the local host on
        // Linux) are never exempt.
        let address = embedded_ipv4(address.to_canonical());
        if address.is_loopback() || address.is_unspecified() {
            return false;
        }
        if !is_restricted(address) {
            return true;
        }
        // A literal has no name, so only range exemptions can match it.
        match name {
            Some(name) => self.exemptions.exempts(name, address),
            None => matches_range(&self.exemptions.ranges, address),
        }
    }
}

/// The IPv4 host a NAT64 (`64:ff9b::/96`) or 6to4 (`2002::/16`) address
/// reaches; any other address unchanged.
fn embedded_ipv4(address: IpAddr) -> IpAddr {
    let IpAddr::V6(v6) = address else {
        return address;
    };
    let octets = v6.octets();
    let ipv4_at = |start: usize| {
        IpAddr::V4(Ipv4Addr::new(
            octets[start],
            octets[start + 1],
            octets[start + 2],
            octets[start + 3],
        ))
    };
    match v6.segments() {
        // NAT64: the low 32 bits are the IPv4 address.
        [0x64, 0xff9b, 0, 0, 0, 0, ..] => ipv4_at(12),
        // 6to4: the 32 bits after the prefix are the relay's IPv4 address.
        [0x2002, ..] => ipv4_at(2),
        _ => address,
    }
}

/// Whether the address falls in the built-in private and reserved ranges.
fn is_restricted(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => RESTRICTED_V4
            .iter()
            .any(|(range, prefix)| prefix_matches(u32::from(*range), u32::from(address), *prefix)),
        IpAddr::V6(address) => RESTRICTED_V6.iter().any(|(range, prefix)| {
            prefix_matches(u128::from(*range), u128::from(address), *prefix)
        }),
    }
}

/// A reqwest resolver that drops addresses outside the policy. The connection
/// uses the addresses this lookup returned, so a later DNS answer cannot
/// rebind it. IP literals skip resolvers; [`EgressPolicy::allows_literal`]
/// gates them.
#[derive(Clone)]
pub(crate) struct EgressResolver {
    policy: EgressPolicy,
}

impl EgressResolver {
    pub(crate) fn new(policy: EgressPolicy) -> Self {
        Self { policy }
    }
}

impl Resolve for EgressResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let policy = self.policy.clone();
        let name = name.as_str().to_owned();
        Box::pin(async move {
            let permitted: Vec<SocketAddr> = lookup_host((name.as_str(), 0))
                .await
                .map_err(|error| -> Box<dyn std::error::Error + Send + Sync> { Box::new(error) })?
                .filter(|address| {
                    policy.allows_resolved(
                        name.trim_matches(['[', ']']).to_ascii_lowercase().as_str(),
                        address.ip(),
                    )
                })
                .collect();
            if permitted.is_empty() {
                // Callers see a generic upstream failure; operators see why.
                tracing::warn!(
                    reason = "egress_blocked",
                    host = name.as_str(),
                    "Upstream host resolved only to addresses the egress policy blocks"
                );
                let error: Box<dyn std::error::Error + Send + Sync> =
                    "resolved address is not permitted by the egress policy".into();
                return Err(error);
            }
            let addrs: Addrs = Box::new(permitted.into_iter());
            Ok(addrs)
        })
    }
}

#[cfg(test)]
mod tests;
