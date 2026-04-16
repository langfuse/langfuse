import { Agent } from "undici";

/**
 * Creates an undici Agent that pins DNS resolution to the given IPs,
 * preventing TOCTOU races between validation and the actual connection.
 * The Agent's lookup override returns a pre-validated IP so the HTTP
 * client never re-resolves the hostname independently.
 */
export function createPinnedAgent(resolvedIPs: string[]): Agent {
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
