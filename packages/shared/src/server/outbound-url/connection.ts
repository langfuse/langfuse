import dns from "node:dns";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import type { LookupFunction } from "node:net";
import { Agent as UndiciAgent, type Dispatcher } from "undici";
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

export interface OutboundUrlConnectionValidationOptions {
  whitelist?: OutboundUrlValidationWhitelist;
  logContext?: string;
}

const secureOutboundDispatchersByPolicy = new Map<string, UndiciAgent>();
const secureOutboundHttpAgentsByPolicy = new Map<
  string,
  { httpAgent: HttpAgent; httpsAgent: HttpsAgent }
>();

export function addSecureOutboundConnectionValidation(
  options: RequestInit,
  validationOptions: OutboundUrlConnectionValidationOptions,
): RequestInit {
  if ((options as RequestInit & { dispatcher?: Dispatcher }).dispatcher) {
    // Proxy dispatchers own the socket path and cannot be wrapped without
    // changing CONNECT semantics. URL and redirect validation still run before
    // the request is dispatched.
    return options;
  }

  return {
    ...options,
    dispatcher: getSecureOutboundDispatcher(validationOptions),
  } as RequestInit & { dispatcher: UndiciAgent };
}

export function createSecureOutboundLookup(
  validationOptions: OutboundUrlConnectionValidationOptions,
  lookup: LookupFunction = dns.lookup,
): LookupFunction {
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

export function getSecureOutboundHttpAgents(
  validationOptions: OutboundUrlConnectionValidationOptions,
  options: { maxSockets?: number } = {},
) {
  const policyKey = JSON.stringify({
    validation: getConnectionValidationPolicyKey(validationOptions),
    maxSockets: options.maxSockets,
  });
  return getOrCreatePolicyResource(
    secureOutboundHttpAgentsByPolicy,
    policyKey,
    "HTTP agent",
    () => {
      const lookup = createSecureOutboundLookup(validationOptions);
      return {
        httpAgent: new HttpAgent({
          keepAlive: true,
          lookup,
          maxSockets: options.maxSockets,
        }),
        httpsAgent: new HttpsAgent({
          keepAlive: true,
          lookup,
          maxSockets: options.maxSockets,
        }),
      };
    },
  );
}

function getSecureOutboundDispatcher(
  validationOptions: OutboundUrlConnectionValidationOptions,
): UndiciAgent {
  const policyKey = getConnectionValidationPolicyKey(validationOptions);
  return getOrCreatePolicyResource(
    secureOutboundDispatchersByPolicy,
    policyKey,
    "connection",
    () =>
      new UndiciAgent({
        connect: {
          // This lookup runs at socket connection time, so DNS rebinding between
          // the earlier URL validation and the actual HTTP connection is blocked.
          lookup: createSecureOutboundLookup(validationOptions),
        },
      }),
  );
}

function getOrCreatePolicyResource<T>(
  cache: Map<string, T>,
  policyKey: string,
  resourceName: string,
  createResource: () => T,
): T {
  const existingResource = cache.get(policyKey);
  if (existingResource) return existingResource;

  if (cache.size >= OUTBOUND_AGENT_POLICY_LIMIT) {
    // Do not evict existing resources: Agents/Dispatchers own socket pools and
    // may still have in-flight streaming responses. Evicting without closing
    // leaks resources, while closing/destroying can break unrelated requests.
    // Exceeding this small policy count is unexpected and should fail closed.
    throw new Error(
      `Maximum secure outbound ${resourceName} policy count (${OUTBOUND_AGENT_POLICY_LIMIT}) exceeded`,
    );
  }

  const resource = createResource();
  cache.set(policyKey, resource);
  return resource;
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
