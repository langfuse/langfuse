const DEFAULT_PORTS: Record<string, number> = {
  "http:": 80,
  "https:": 443,
};

type NoProxyEntry = {
  hostname: string;
  port: number;
};

function parseNoProxy(noProxyValue: string): NoProxyEntry[] {
  const entries: NoProxyEntry[] = [];

  for (const block of noProxyValue.split(/[,\s]/)) {
    if (!block) continue;

    const parsed = block.match(/^(.+):(\d+)$/);
    entries.push({
      // strip a leading dot or asterisk-with-dot so ".corp" / "*.corp"
      // behave like "corp": the host itself and all of its subdomains
      hostname: (parsed ? parsed[1] : block)
        .replace(/^\*?\./, "")
        .toLowerCase(),
      port: parsed ? Number.parseInt(parsed[2], 10) : 0,
    });
  }

  return entries;
}

/**
 * Decides whether a request to `url` must skip the forward proxy and connect
 * directly, using the same NO_PROXY semantics as undici's EnvHttpProxyAgent:
 * entries are comma- or whitespace-separated hostnames matched
 * case-insensitively against the target host and all of its subdomains, an
 * optional ":<port>" suffix restricts an entry to that port, and a value of
 * "*" bypasses the proxy for every host.
 */
export function shouldBypassProxy(url: URL, noProxyValue: string): boolean {
  const entries = parseNoProxy(noProxyValue);
  if (entries.length === 0) {
    return false; // always proxy when NO_PROXY is unset or empty
  }
  if (noProxyValue === "*") {
    return true; // never proxy when the wildcard is set
  }

  // Strip the port from url.host instead of using url.hostname so the
  // brackets around IPv6 addresses are kept, matching undici.
  const hostname = url.host.replace(/:\d*$/, "").toLowerCase();
  const port =
    Number.parseInt(url.port, 10) || DEFAULT_PORTS[url.protocol] || 0;

  for (const entry of entries) {
    if (entry.port && entry.port !== port) {
      continue;
    }
    if (hostname === entry.hostname) {
      return true;
    }
    // the hostname is a subdomain of the entry
    if (hostname.slice(-(entry.hostname.length + 1)) === `.${entry.hostname}`) {
      return true;
    }
  }

  return false;
}
