import ipaddr from "ipaddr.js";

const DECIMAL_CIDR_PREFIX = /^\d{1,3}$/;

// One parser for startup validation and the runtime block. `Number("0x10")`
// and `parseInt("0x10", 10)` disagree, and an empty prefix becomes 0 in one
// of them, so a typo must not boot as a different range than it enforces.
export function parseBlockedCidr(
  cidr: string,
): { network: ReturnType<typeof ipaddr.parse>; prefix: number } | undefined {
  const slash = cidr.indexOf("/");
  if (slash <= 0 || slash !== cidr.lastIndexOf("/")) return undefined;
  const bits = cidr.slice(slash + 1);
  if (!DECIMAL_CIDR_PREFIX.test(bits)) return undefined;
  const prefix = Number(bits);
  try {
    const network = ipaddr.parse(cidr.slice(0, slash));
    const maxPrefix = network.kind() === "ipv4" ? 32 : 128;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      return undefined;
    }
    return { network, prefix };
  } catch {
    return undefined;
  }
}
