import ipaddr from "ipaddr.js";

const DECIMAL_CIDR_PREFIX = /^\d{1,3}$/;

/** parseBlockedCidr parses a canonical CIDR for startup checks and the runtime block. */
export function parseBlockedCidr(
  cidr: string,
): { network: ReturnType<typeof ipaddr.parse>; prefix: number } | undefined {
  const slash = cidr.indexOf("/");
  if (slash <= 0 || slash !== cidr.lastIndexOf("/")) return undefined;
  const bits = cidr.slice(slash + 1);
  if (!DECIMAL_CIDR_PREFIX.test(bits)) return undefined;
  const prefix = Number(bits);
  const address = cidr.slice(0, slash);
  try {
    const network = ipaddr.parse(address);
    // inet_aton forms (`203.0.114`, `010.1.2.0`) parse as a different address than written.
    if (
      network.kind() === "ipv4" &&
      !ipaddr.IPv4.isValidFourPartDecimal(address)
    ) {
      return undefined;
    }
    const maxPrefix = network.kind() === "ipv4" ? 32 : 128;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      return undefined;
    }
    return { network, prefix };
  } catch {
    return undefined;
  }
}
