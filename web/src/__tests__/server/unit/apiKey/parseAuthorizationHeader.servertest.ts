import { describe, expect, it } from "vitest";

import { parseAuthorizationHeader } from "@/src/features/apiKey/helpers/parseAuthorizationHeader";

const basicHeader = (pub: string, secret: string) =>
  `Basic ${btoa(`${pub}:${secret}`)}`;

describe("parseAuthorizationHeader", () => {
  it("decodes a Basic public:secret pair", () => {
    expect(parseAuthorizationHeader(basicHeader("pk-lf-1", "sk-lf-1"))).toEqual(
      {
        kind: "basic",
        publicKey: "pk-lf-1",
        secretKey: "sk-lf-1",
      },
    );
  });

  it("reads a Bearer token", () => {
    expect(parseAuthorizationHeader("Bearer sk-secret")).toEqual({
      kind: "bearer",
      token: "sk-secret",
    });
  });

  it("a missing header is malformed", () => {
    expect(parseAuthorizationHeader(undefined)).toEqual({ kind: "malformed" });
  });

  it("an unknown scheme is malformed", () => {
    expect(parseAuthorizationHeader("Digest x")).toEqual({ kind: "malformed" });
  });

  it("a Basic payload without a colon is malformed", () => {
    expect(parseAuthorizationHeader(`Basic ${btoa("no-colon")}`)).toEqual({
      kind: "malformed",
    });
  });

  it("an invalid base64 Basic payload is malformed", () => {
    expect(parseAuthorizationHeader("Basic !!!invalid!!!")).toEqual({
      kind: "malformed",
    });
  });
});
