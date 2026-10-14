import { describe, expect, it } from "vitest";
import {
  CircularRedirectError,
  MaxRedirectsExceededError,
  redactUrlCredentials,
  urlForLog,
} from "./fetch";

describe("redactUrlCredentials", () => {
  it("strips a user:password userinfo", () => {
    expect(
      redactUrlCredentials("http://exporter:hunter2@169.254.169.254/"),
    ).toBe("http://***@169.254.169.254/");
  });

  it("strips a username-only userinfo", () => {
    expect(
      redactUrlCredentials("https://leaked-token@host.example/batch/"),
    ).toBe("https://***@host.example/batch/");
  });

  // The redirect reporting paths embed URLs in a longer message, so a single
  // replacement is not enough.
  it("redacts every occurrence in a message", () => {
    expect(
      redactUrlCredentials(
        "failed for url http://a:b@10.0.0.1/ from https://c:d@host.example/",
      ),
    ).toBe(
      "failed for url http://***@10.0.0.1/ from https://***@host.example/",
    );
  });

  it("leaves a credential-free URL untouched", () => {
    expect(redactUrlCredentials("https://host.example/batch/?x=1#y")).toBe(
      "https://host.example/batch/?x=1#y",
    );
  });

  // Non-vacuity: an @ that is not userinfo must survive, or redaction would be
  // mangling ordinary paths and prose.
  it("does not touch an @ in the path or in bare text", () => {
    expect(redactUrlCredentials("https://host.example/@handle")).toBe(
      "https://host.example/@handle",
    );
    expect(redactUrlCredentials("contact user@host.example")).toBe(
      "contact user@host.example",
    );
  });
});

describe("urlForLog", () => {
  it("keeps the origin and path and drops a query-string secret", () => {
    expect(
      urlForLog(
        "https://prod.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=super-secret-sig",
      ),
    ).toBe(
      "https://prod.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke",
    );
  });

  it("drops userinfo and a fragment along with the query", () => {
    expect(
      urlForLog("https://exporter:hunter2@host.example/batch/?x=1#frag"),
    ).toBe("https://host.example/batch/");
  });

  it("keeps a credential-free path", () => {
    expect(urlForLog("https://webhook-error.example.com/test")).toBe(
      "https://webhook-error.example.com/test",
    );
  });

  it("strips a query from a string that is not a URL", () => {
    expect(urlForLog("not a url?sig=super-secret-sig")).toBe("not a url");
  });

  it("keeps the host of a non-special scheme", () => {
    expect(urlForLog("gopher://169.254.169.254/x?sig=super-secret-sig")).toBe(
      "gopher://169.254.169.254/x",
    );
    expect(urlForLog("file:///etc/passwd")).toBe("file:///etc/passwd");
  });
});

const signedRedirectUrl =
  "https://exporter:hunter2@host.example/hook?sig=super-secret-sig";

const expectSignedUrlRedacted = (
  error: Error & { redirectChain: string[] },
) => {
  expect(error.message).toContain("https://host.example/hook");
  expect(error.message).not.toContain("super-secret-sig");
  expect(error.message).not.toContain("hunter2");
  expect(error.stack).not.toContain("super-secret-sig");
  expect(error.stack).not.toContain("hunter2");
  expect(error.redirectChain).toEqual([
    "https://host.example/hook",
    "https://host.example/hook",
  ]);
  expect(JSON.stringify(error)).not.toContain("super-secret-sig");
  expect(JSON.stringify(error)).not.toContain("hunter2");
};

describe("redirect error reporting", () => {
  it("keeps a signed URL out of MaxRedirectsExceededError", () => {
    expectSignedUrlRedacted(
      new MaxRedirectsExceededError(5, [signedRedirectUrl, signedRedirectUrl]),
    );
  });

  it("keeps a signed URL out of CircularRedirectError", () => {
    expectSignedUrlRedacted(
      new CircularRedirectError([signedRedirectUrl, signedRedirectUrl]),
    );
  });
});
