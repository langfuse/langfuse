import { describe, it, expect } from "vitest";
import { OutboundUrlValidationError } from "@langfuse/shared/src/server";
import {
  classifyCustomerFault,
  isCustomerFaultError,
} from "./customerFaultClassification";

// LFE-14990: the PostHog integration must treat a deterministic
// customer-config fault (a bad/malicious hostname rejected by
// validateWebhookURL) as the customer's problem — classify it, disable, and
// stay quiet — while transient/infra faults keep retrying and tripping the
// monitor. This module mirrors the blob-storage isCustomerFaultError exports:
// classifyCustomerFault(error) -> reason | undefined, isCustomerFaultError ->
// boolean, walking the `cause` chain and duck-typing on
// `.name === "OutboundUrlValidationError"` + `.code`.

// The deterministic customer-fault allowlist from the spec. Every code here is
// a stable property of the persisted hostname config, so it is safe to
// auto-disable on.
const ALLOWLISTED_CUSTOMER_FAULT_CODES = [
  "blocked-hostname",
  "blocked-ip",
  "invalid-syntax",
  "invalid-encoding",
  "https-required",
  "protocol-not-allowed",
  "url-credentials-not-allowed",
] as const;

// One level of Error wrapping, as the throw site produces via
// `new Error(msg, { cause: originalError })`. Classification must survive it.
const wrapped = (cause: unknown): Error => new Error("wrapped", { cause });

describe("classifyCustomerFault / isCustomerFaultError (PostHog, LFE-14990)", () => {
  describe("allowlisted OutboundUrlValidationError codes are customer faults", () => {
    // Load-bearing: these are the codes whose only cure is a customer config
    // change, so each must map to a defined reason (the disable decision).
    it.each(ALLOWLISTED_CUSTOMER_FAULT_CODES)(
      "%s -> a defined customer-fault reason",
      (code) => {
        const err = new OutboundUrlValidationError(code, "blocked");
        const reason = classifyCustomerFault(err);
        expect(reason).toBeDefined();
        expect(typeof reason).toBe("string");
        expect(isCustomerFaultError(err)).toBe(true);
      },
    );

    // Load-bearing: the handler rewraps into `new Error(msg, { cause })`, so
    // classification must walk the cause chain, not just the top-level error.
    it.each(ALLOWLISTED_CUSTOMER_FAULT_CODES)(
      "a wrapped %s (in .cause) is still a customer fault",
      (code) => {
        const err = wrapped(new OutboundUrlValidationError(code, "blocked"));
        expect(classifyCustomerFault(err)).toBeDefined();
        expect(isCustomerFaultError(err)).toBe(true);
      },
    );
  });

  describe("non-allowlisted faults stay non-disabling (retry / investigate)", () => {
    // Load-bearing negative control: dns-lookup-failed depends on runtime
    // resolver state, not the config — it must NOT auto-disable, or a transient
    // DNS outage would permanently kill a working integration.
    it("dns-lookup-failed -> undefined (raw and wrapped)", () => {
      const err = new OutboundUrlValidationError(
        "dns-lookup-failed",
        "DNS lookup failed for host.example",
      );
      expect(classifyCustomerFault(err)).toBeUndefined();
      expect(classifyCustomerFault(wrapped(err))).toBeUndefined();
      expect(isCustomerFaultError(err)).toBe(false);
      expect(isCustomerFaultError(wrapped(err))).toBe(false);
    });

    // Load-bearing negative control: a generic infra error (e.g. ClickHouse
    // read failure) must keep throwing/retrying, not disable.
    it("a generic Error -> undefined", () => {
      const err = new Error("ClickHouse read failed");
      expect(classifyCustomerFault(err)).toBeUndefined();
      expect(classifyCustomerFault(wrapped(err))).toBeUndefined();
      expect(isCustomerFaultError(err)).toBe(false);
    });

    // Load-bearing: classification is code-based, not message-based — a bare
    // Error that merely echoes the message must not trip the disable path.
    it("a code-less Error sharing the message text -> undefined", () => {
      const err = new Error("Blocked hostname detected");
      expect(classifyCustomerFault(err)).toBeUndefined();
      expect(isCustomerFaultError(err)).toBe(false);
    });

    it("null / undefined / non-error inputs -> undefined / false", () => {
      expect(classifyCustomerFault(null)).toBeUndefined();
      expect(classifyCustomerFault(undefined)).toBeUndefined();
      expect(isCustomerFaultError(null)).toBe(false);
      expect(isCustomerFaultError("blocked-hostname")).toBe(false);
    });
  });
});
