import ipaddr from "ipaddr.js";

// Static deny-list (IPv4 + IPv6) for SSRF protection
const BLOCKED_CIDRS = [
  // IPv4
  "0.0.0.0/8", // "this network"
  "10.0.0.0/8", // RFC1918 private
  "100.64.0.0/10", // CG-NAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local (includes AWS/GCP metadata)
  "172.16.0.0/12", // RFC1918 private
  "192.0.0.0/29", // IETF protocol
  "192.0.2.0/24", // TEST-NET-1
  "192.168.0.0/16", // RFC1918 private
  "198.18.0.0/15", // benchmark
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // future / reserved
  "255.255.255.255/32", // broadcast
  // IPv6
  "::/128", // unspecified
  "::1/128", // loopback
  "::ffff:0:0/96", // IPv4-mapped IPv6
  "fc00::/7", // unique-local
  "fe80::/10", // link-local
  "ff00::/8", // multicast
  "100::/64", // discard-only
  "2001::/32", // Teredo tunneling
  "2001:db8::/32", // doc
];

// Pre-parse blocked networks once for performance
const blockedNetworks = BLOCKED_CIDRS.map((cidr) => {
  const [addr, bits] = cidr.split("/");
  const parsed = ipaddr.parse(addr);
  return {
    network: parsed,
    kind: parsed.kind(),
    mask: parseInt(bits, 10),
  };
});

/**
 * Check if an IP address is blocked based on CIDR ranges
 */
export function isIPBlocked(
  ipString: string,
  whitelistedIPs: string[],
  whiteListedIpSegments: string[],
): boolean {
  try {
    // Check if IP is in whitelist first
    if (whitelistedIPs.includes(ipString.toLowerCase().trim())) {
      return false;
    }

    const ip = ipaddr.parse(ipString);

    const whitelistedSegments = whiteListedIpSegments.map((cidr) => {
      const [addr, bits] = cidr.split("/");
      const parsed = ipaddr.parse(addr);
      return {
        network: parsed,
        kind: parsed.kind(),
        mask: parseInt(bits, 10),
      };
    });

    for (const { network, mask, kind } of whitelistedSegments) {
      if (ip.kind() !== kind) continue;
      if (ip.match(network, mask)) return false;
    }

    for (const { network, mask, kind } of blockedNetworks) {
      if (ip.kind() !== kind) continue;
      if (ip.match(network, mask)) return true;
    }
    return false;
  } catch {
    // If IP parsing fails, block it to be safe
    return true;
  }
}

/**
 * Check if a string is an IP address
 */
export function isIPAddress(hostname: string): boolean {
  // Remove brackets from IPv6 addresses
  const cleaned = hostname.replace(/^\[|\]$/g, "");

  try {
    ipaddr.parse(cleaned);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if hostname should be blocked based on patterns
 */
export function isHostnameBlocked(hostname: string): boolean {
  const blockedPatterns = [
    // Localhost variations
    "localhost",
    "*.localhost",

    // Common internal hostnames
    "internal",
    "*.internal",
    "intranet",
    "*.intranet",

    // Cloud metadata endpoints
    "metadata.google.internal",
    "169.254.169.254",

    // Docker/container networking
    "host.docker.internal",
    "gateway.docker.internal",
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
        return true;
      }
    } else if (hostname === pattern) {
      return true;
    }
  }

  return false;
}
