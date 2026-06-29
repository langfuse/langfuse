import dns from "node:dns";
import { Agent } from "undici";
import type { OutboundUrlValidationWhitelist } from "./validation";
import { validateOutboundResolvedIp } from "./validation";

// We currently expect only a few policy/context combinations in normal
// operation, e.g. strict image URL validation and webhook/self-hosting env
// validation. Keep the cap well above that to allow future static policies, but
// low enough to catch accidental high-cardinality whitelists before they create
// unbounded Agent pools.
const OUTBOUND_AGENT_POLICY_LIMIT = 32;
const DEFAULT_OUTBOUND_URL_VALIDATION_WHITELIST: OutboundUrlValidationWhitelist =
  {
    hosts: [],
    ips: [],
    ip_ranges: [],
  };

type DnsLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;
type DnsLookup = (
  hostname: string,
  options: dns.LookupOptions,
  callback: DnsLookupCallback,
) => void;

export interface OutboundUrlConnectionValidationOptions {
  whitelist?: OutboundUrlValidationWhitelist;
  logContext?: string;
}

type RequestInitWithUndiciDispatcher = RequestInit & {
  dispatcher?: Agent;
};

const secureOutboundDispatchersByPolicy = new Map<string, Agent>();

export function addSecureOutboundConnectionValidation(
  options: RequestInit,
  validationOptions: OutboundUrlConnectionValidationOptions,
): RequestInit {
  return {
    ...options,
    dispatcher: getSecureOutboundDispatcher(validationOptions),
  } as RequestInitWithUndiciDispatcher;
}

function createSecureOutboundLookup(
  validationOptions: OutboundUrlConnectionValidationOptions,
  lookup: typeof dns.lookup = dns.lookup,
): DnsLookup {
  return (hostname, options, callback) => {
    lookup(hostname, options, (err, address, family) => {
      if (err) {
        callback(err, address, family);
        return;
      }

      try {
        validateConnectionTimeLookupResult(
          hostname,
          address,
          validationOptions,
        );
      } catch (error) {
        callback(error as NodeJS.ErrnoException, address, family);
        return;
      }

      callback(null, address, family);
    });
  };
}

function getSecureOutboundDispatcher(
  validationOptions: OutboundUrlConnectionValidationOptions,
): Agent {
  const policyKey = getConnectionValidationPolicyKey(validationOptions);
  const existingDispatcher = secureOutboundDispatchersByPolicy.get(policyKey);
  if (existingDispatcher) return existingDispatcher;

  if (secureOutboundDispatchersByPolicy.size >= OUTBOUND_AGENT_POLICY_LIMIT) {
    // Do not evict existing Agents: they own socket pools and may still have
    // in-flight streaming responses. Evicting without closing leaks resources,
    // while closing/destroying can break unrelated requests. Exceeding this
    // small policy count is unexpected and should fail closed.
    throw new Error(
      `Maximum secure outbound connection policy count (${OUTBOUND_AGENT_POLICY_LIMIT}) exceeded`,
    );
  }

  const dispatcher = new Agent({
    connect: {
      // This lookup runs at socket connection time, so DNS rebinding between
      // the earlier URL validation and the actual HTTP connection is blocked.
      lookup: createSecureOutboundLookup(validationOptions),
    },
  });

  secureOutboundDispatchersByPolicy.set(policyKey, dispatcher);
  return dispatcher;
}

function validateConnectionTimeLookupResult(
  hostname: string,
  address: string | dns.LookupAddress[],
  validationOptions: OutboundUrlConnectionValidationOptions,
): void {
  const lookupAddresses = Array.isArray(address)
    ? address
    : [{ address, family: undefined }];

  for (const lookupAddress of lookupAddresses) {
    validateOutboundResolvedIp({
      hostname,
      ip: lookupAddress.address,
      whitelist:
        validationOptions.whitelist ??
        DEFAULT_OUTBOUND_URL_VALIDATION_WHITELIST,
      logContext: validationOptions.logContext ?? "Outbound URL",
    });
  }
}

function getConnectionValidationPolicyKey({
  whitelist,
  logContext,
}: OutboundUrlConnectionValidationOptions): string {
  // Keep separate Agent pools per whitelist. A single shared Agent could reuse
  // a socket opened under a permissive policy for a later stricter request to
  // the same origin without performing another DNS lookup. The lookup closure
  // also captures logContext, so include it to avoid mislabeling connection-time
  // block warnings when different flows share the same whitelist.
  return JSON.stringify({
    whitelist: normalizeWhitelist(whitelist),
    logContext: logContext ?? "Outbound URL",
  });
}

function normalizeWhitelist(
  whitelist: OutboundUrlValidationWhitelist = DEFAULT_OUTBOUND_URL_VALIDATION_WHITELIST,
): OutboundUrlValidationWhitelist {
  return {
    hosts: [...whitelist.hosts].sort(),
    ips: [...whitelist.ips].sort(),
    ip_ranges: [...whitelist.ip_ranges].sort(),
  };
}
