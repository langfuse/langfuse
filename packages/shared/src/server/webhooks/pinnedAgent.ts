import { Agent } from "undici";

/**
 * Creates an undici Agent that pins DNS resolution to the given IPs,
 * preventing TOCTOU races between validation and the actual connection.
 * The Agent's lookup override returns a pre-validated IP so the HTTP
 * client never re-resolves the hostname independently.
 */
export function createPinnedAgent(resolvedIPs: string[]): Agent {
  // Deliberately pin to a single validated IP. Cycling through alternates on
  // connection failure could re-open the TOCTOU gap by allowing a DNS-rebinding
  // attacker to smuggle a malicious IP into the retry path.
  const ip = resolvedIPs[0];
  const family = ip.includes(":") ? 6 : 4;
  return new Agent({
    connect: {
      lookup: (
        _hostname: string,
        _options: unknown,
        callback: (
          err: NodeJS.ErrnoException | null,
          address: string,
          family: number,
        ) => void,
      ) => {
        callback(null, ip, family);
      },
    },
  });
}
