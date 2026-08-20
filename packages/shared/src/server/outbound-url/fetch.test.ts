import { describe, expect, it } from "vitest";
import { redactUrlCredentials } from "./fetch";

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
