import { describe, it, expect } from "vitest";
import { OutboundUrlValidationError } from "@langfuse/shared/src/server";
import {
  classifyCustomerFault,
  isCustomerFaultError,
} from "./isCustomerFaultError";

// Forwarding smoke test only. This module re-exports the classifier from
// ../integrations/customerFaultClassification, which owns the exhaustive case
// matrix (provider codes, HTTP-status rules, cause-chain traversal). Importing
// from THIS path on purpose: the point is to catch a broken re-export surface,
// which typechecking alone would not — a re-export can satisfy its types and
// still resolve to the wrong binding at runtime.
describe("blob storage customer-fault re-export", () => {
  it("forwards a customer fault to the shared classifier", () => {
    const err = new OutboundUrlValidationError(
      "blocked-ip",
      "Blocked IP address detected",
    );
    expect(isCustomerFaultError(err)).toBe(true);
    expect(classifyCustomerFault(err)).toBe("ssrf_blocked_endpoint");
  });

  it("forwards a non-disabling fault to the shared classifier", () => {
    const err = new OutboundUrlValidationError(
      "dns-lookup-failed",
      "DNS lookup failed for host.example",
    );
    expect(isCustomerFaultError(err)).toBe(false);
    expect(classifyCustomerFault(err)).toBeUndefined();
  });
});
