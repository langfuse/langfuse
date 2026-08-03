const { resolve4Mock, resolve6Mock, lookupMock } = vi.hoisted(() => ({
  resolve4Mock: vi.fn<(hostname: string) => Promise<string[]>>(),
  resolve6Mock: vi.fn<(hostname: string) => Promise<string[]>>(),
  lookupMock:
    vi.fn<
      (
        hostname: string,
        options: { all: true },
      ) => Promise<Array<{ address: string; family: 4 | 6 }>>
    >(),
}));

vi.mock("node:dns/promises", () => ({
  default: {
    resolve4: resolve4Mock,
    resolve6: resolve6Mock,
    lookup: lookupMock,
  },
  resolve4: resolve4Mock,
  resolve6: resolve6Mock,
  lookup: lookupMock,
}));

import { validateSsoConfig } from "@/src/ee/features/multi-tenant-sso/validateSsoConfig";
import { type SsoProviderSchema } from "@/src/ee/features/multi-tenant-sso/types";

const PUBLIC_IP = "93.184.216.34";
const ISSUER = "https://example.okta.com";

const fetchMock = vi.fn<typeof fetch>();

function oktaPayload(issuer: string): SsoProviderSchema {
  return {
    domain: "sso-ssrf.example.com",
    authProvider: "okta",
    authConfig: {
      clientId: "okta-client",
      clientSecret: "okta-secret",
      issuer,
      allowDangerousEmailAccountLinking: false,
    },
  };
}

function resolvesTo(ip: string) {
  resolve4Mock.mockResolvedValue([ip]);
  resolve6Mock.mockRejectedValue(new Error("ENODATA"));
  lookupMock.mockResolvedValue([{ address: ip, family: 4 }]);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/authorize`,
          token_endpoint: `${ISSUER}/oauth/token`,
          jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);

  resolve4Mock.mockReset();
  resolve6Mock.mockReset();
  lookupMock.mockReset();
  resolvesTo(PUBLIC_IP);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("validateSsoConfig — SSRF guard on the discovery fetch", () => {
  it.each([
    ["an RFC1918 resolution", "https://idp.evil.example", "10.1.2.3"],
    ["a loopback resolution", "https://idp.evil.example", "127.0.0.1"],
    ["a loopback IP literal", "https://127.0.0.1:8443", PUBLIC_IP],
    ["the cloud metadata literal", "https://169.254.169.254", PUBLIC_IP],
    ["a blocked internal hostname", "https://localhost:8443", PUBLIC_IP],
    ["embedded credentials", "https://user:pass@example.okta.com", PUBLIC_IP],
  ])("rejects %s without fetching", async (_label, issuer, ip) => {
    resolvesTo(ip);

    await expect(validateSsoConfig(oktaPayload(issuer))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the issuer hostname does not resolve", async () => {
    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));
    resolve6Mock.mockRejectedValue(new Error("ENODATA"));
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));

    await expect(
      validateSsoConfig(oktaPayload("https://idp.nonexistent.example")),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still allows a publicly resolvable issuer on a non-standard port", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            issuer: "https://idp.example.com:8443",
            authorization_endpoint: "https://idp.example.com:8443/authorize",
            token_endpoint: "https://idp.example.com:8443/token",
            jwks_uri: "https://idp.example.com:8443/jwks",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    await expect(
      validateSsoConfig(oktaPayload("https://idp.example.com:8443")),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a 3xx from the discovery endpoint", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        }),
    );

    await expect(validateSsoConfig(oktaPayload(ISSUER))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("attaches connect-time IP validation to the discovery fetch", async () => {
    await validateSsoConfig(oktaPayload(ISSUER));

    const options = fetchMock.mock.calls[0]?.[1] as
      | { dispatcher?: unknown }
      | undefined;
    expect(options?.dispatcher).toBeDefined();
  });

  it("skips the guard for OAuth-only providers that have no discovery document", async () => {
    await expect(
      validateSsoConfig({
        domain: "sso-ssrf.example.com",
        authProvider: "github",
        authConfig: {
          clientId: "gh-client",
          clientSecret: "gh-secret",
          allowDangerousEmailAccountLinking: false,
        },
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });
});
