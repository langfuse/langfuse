import { describe, expect, it } from "vitest";
import { shouldBypassProxy } from "./noProxy";

const url = (value: string) => new URL(value);

describe("shouldBypassProxy", () => {
  it("proxies everything when NO_PROXY is empty", () => {
    expect(shouldBypassProxy(url("https://api.openai.com"), "")).toBe(false);
    expect(shouldBypassProxy(url("http://llm.internal.corp"), "")).toBe(false);
  });

  it("bypasses the proxy for every host on the wildcard", () => {
    expect(shouldBypassProxy(url("https://api.openai.com"), "*")).toBe(true);
  });

  it("bypasses on an exact hostname match", () => {
    expect(
      shouldBypassProxy(url("http://llm.internal.corp"), "llm.internal.corp"),
    ).toBe(true);
    expect(
      shouldBypassProxy(url("https://api.openai.com"), "llm.internal.corp"),
    ).toBe(false);
  });

  it("bypasses subdomains of an entry", () => {
    expect(
      shouldBypassProxy(url("http://llm.internal.corp"), "internal.corp"),
    ).toBe(true);
    expect(
      shouldBypassProxy(url("http://a.b.internal.corp"), "internal.corp"),
    ).toBe(true);
  });

  it("requires a domain-label boundary for suffix matches", () => {
    expect(
      shouldBypassProxy(url("http://evilinternal.corp"), "internal.corp"),
    ).toBe(false);
  });

  it("treats leading-dot and asterisk-dot entries like the bare domain", () => {
    for (const entry of [".internal.corp", "*.internal.corp"]) {
      expect(shouldBypassProxy(url("http://internal.corp"), entry)).toBe(true);
      expect(shouldBypassProxy(url("http://llm.internal.corp"), entry)).toBe(
        true,
      );
    }
  });

  it("matches case-insensitively", () => {
    expect(
      shouldBypassProxy(url("http://LLM.Internal.CORP"), "Internal.Corp"),
    ).toBe(true);
  });

  it("supports comma- and whitespace-separated lists", () => {
    const noProxy = "example.com, internal.corp\tother.example";
    expect(shouldBypassProxy(url("http://internal.corp"), noProxy)).toBe(true);
    expect(shouldBypassProxy(url("http://other.example"), noProxy)).toBe(true);
    expect(shouldBypassProxy(url("http://unrelated.io"), noProxy)).toBe(false);
  });

  it("restricts port-qualified entries to that port", () => {
    expect(
      shouldBypassProxy(url("http://internal.corp:8443"), "internal.corp:8443"),
    ).toBe(true);
    expect(
      shouldBypassProxy(url("http://internal.corp:9000"), "internal.corp:8443"),
    ).toBe(false);
  });

  it("compares port-qualified entries against protocol default ports", () => {
    expect(
      shouldBypassProxy(url("https://internal.corp"), "internal.corp:443"),
    ).toBe(true);
    expect(
      shouldBypassProxy(url("http://internal.corp"), "internal.corp:443"),
    ).toBe(false);
  });

  it("matches IP literals exactly", () => {
    expect(shouldBypassProxy(url("http://127.0.0.1:3000"), "127.0.0.1")).toBe(
      true,
    );
    expect(shouldBypassProxy(url("http://127.0.0.2:3000"), "127.0.0.1")).toBe(
      false,
    );
  });

  it("matches bracketed IPv6 entries against bracketed hosts", () => {
    // url.host keeps the brackets around IPv6 addresses, so entries must be
    // written with brackets too — the same behavior as undici.
    expect(shouldBypassProxy(url("http://[::1]:3000"), "[::1]")).toBe(true);
    expect(shouldBypassProxy(url("http://[::1]:3000"), "::1")).toBe(false);
  });
});
