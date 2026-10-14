import { Resolver } from "node:dns";

// Query through Cloudflare and Google public resolvers instead of the system
// resolver so verification reflects DNS changes within seconds rather than
// waiting for the OS-configured recursive resolver's negative cache (which can
// persist up to the zone's SOA minimum TTL — typically up to 1 hour). Both
// resolvers strictly respect record TTLs and validate DNSSEC.
const PUBLIC_DNS_SERVERS = ["8.8.8.8", "1.1.1.1"] as const;

export async function resolveTxtFresh(fqdn: string): Promise<string[][]> {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  resolver.setServers([...PUBLIC_DNS_SERVERS]);
  return await new Promise<string[][]>((resolve, reject) => {
    resolver.resolveTxt(fqdn, (err, records) => {
      if (err) reject(err);
      else resolve(records);
    });
  });
}
