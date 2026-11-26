import { describe, expect, it } from "vitest";

import { findGuardrailMatches } from "./findGuardrailMatches";

describe("findGuardrailMatches", () => {
  it("highlights matches from multiple selected PII presets including IP addresses", () => {
    const segments = findGuardrailMatches(
      "My SSN is 123-45-6789, reach me at dana@example.com from 192.168.1.42 or 2001:db8::1.",
      { presets: ["us_ssn", "email", "ip_address"] },
    );
    expect(segments).toEqual([
      { text: "My SSN is ", matched: false },
      { text: "123-45-6789", matched: true },
      { text: ", reach me at ", matched: false },
      { text: "dana@example.com", matched: true },
      { text: " from ", matched: false },
      { text: "192.168.1.42", matched: true },
      { text: " or ", matched: false },
      { text: "2001:db8::1", matched: true },
      { text: ".", matched: false },
    ]);
  });

  it("matches secret presets and custom secret prefixes with non-token boundaries", () => {
    const segments = findGuardrailMatches(
      "Keys: sk-lf-1234567890abcdef and acme_sk_1234567890abcdef and notacme_sk_1234567890abcdef",
      {
        presets: ["langfuse_api_key"],
        secretPrefixes: ["acme_sk_"],
      },
    );
    expect(segments).toEqual([
      { text: "Keys: ", matched: false },
      { text: "sk-lf-1234567890abcdef", matched: true },
      { text: " and ", matched: false },
      { text: "acme_sk_1234567890abcdef", matched: true },
      { text: " and notacme_sk_1234567890abcdef", matched: false },
    ]);
  });

  it("matches ASCII case-insensitive whole words/phrases in contains list", () => {
    const segments = findGuardrailMatches(
      "Confidential project: DO NOT SHARE unconfidentially.",
      {
        presets: [],
        containsWords: ["confidential", "do not share"],
      },
    );
    expect(segments).toEqual([
      { text: "Confidential", matched: true },
      { text: " project: ", matched: false },
      { text: "DO NOT SHARE", matched: true },
      { text: " unconfidentially.", matched: false },
    ]);
  });

  it("returns plain text when nothing matches or empty", () => {
    expect(
      findGuardrailMatches("hello world", { presets: ["us_ssn"] }),
    ).toEqual([{ text: "hello world", matched: false }]);
    expect(findGuardrailMatches("123-45-6789", { presets: [] })).toEqual([
      { text: "123-45-6789", matched: false },
    ]);
    expect(findGuardrailMatches("", { presets: ["us_ssn"] })).toEqual([]);
  });

  it("does not flag C++/Rust/CSS scope operators as compressed IPv6 addresses", () => {
    const code = "std::vector<int> Vec::new() Foo::bar a::before";
    expect(findGuardrailMatches(code, { presets: ["ip_address"] })).toEqual([
      { text: code, matched: false },
    ]);
    expect(
      findGuardrailMatches("connect fe80::1 and ::1", {
        presets: ["ip_address"],
      }),
    ).toEqual([
      { text: "connect ", matched: false },
      { text: "fe80::1", matched: true },
      { text: " and ", matched: false },
      { text: "::1", matched: true },
    ]);
  });
});
