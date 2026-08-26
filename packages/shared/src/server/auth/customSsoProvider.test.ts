import { describe, expect, it, vi } from "vitest";

// The provider reads the claim-name overrides at import time; stub the env so
// this stays a unit test with the documented defaults.
vi.mock("../../env", () => ({
  env: {
    LANGFUSE_CUSTOM_SSO_EMAIL_CLAIM: "email",
    LANGFUSE_CUSTOM_SSO_NAME_CLAIM: "name",
    LANGFUSE_CUSTOM_SSO_SUB_CLAIM: "sub",
    LANGFUSE_CUSTOM_SSO_IMAGE_CLAIM: "picture",
  },
}));

import { CustomSSOProvider } from "./customSsoProvider";

const baseOptions = {
  clientId: "client-id",
  clientSecret: "client-secret",
  issuer: "https://idp.example.com/oidc",
};

// An IdP that keeps `email`/`name` out of the ID token and only serves them
// from the userinfo endpoint, e.g. Oracle IAM.
const idTokenClaims = { sub: "user-1", iss: baseOptions.issuer };
const userinfoResponse = {
  sub: "user-1",
  email: "user@example.com",
  name: "Some User",
};

function fakeTokenSet(
  overrides: {
    id_token?: string;
    claims?: () => Record<string, unknown>;
  } = {},
) {
  return {
    id_token: "signed.id.token" as string | undefined,
    access_token: "access-token",
    claims: () => idTokenClaims as Record<string, unknown>,
    ...overrides,
  };
}

/** Invokes the provider's `userinfo.request` handler with a stubbed client. */
async function requestProfile(
  provider: ReturnType<typeof CustomSSOProvider>,
  tokens: ReturnType<typeof fakeTokenSet>,
  userinfo: ReturnType<typeof vi.fn> = vi.fn(async () => userinfoResponse),
) {
  const handler = provider.userinfo;
  if (!handler || typeof handler === "string" || !handler.request) {
    throw new Error("provider does not fetch the profile from userinfo");
  }
  const profile = await handler.request({
    client: { userinfo } as any,
    tokens: tokens as any,
    provider: provider as any,
  });
  return { profile, userinfo };
}

describe("CustomSSOProvider", () => {
  it("reads the profile from the ID token claims by default", () => {
    expect(CustomSSOProvider(baseOptions).userinfo).toBeUndefined();
  });

  it("sources the profile from the userinfo endpoint when fetchUserInfo is set", async () => {
    const provider = CustomSSOProvider({ ...baseOptions, fetchUserInfo: true });

    const tokens = fakeTokenSet();
    const { profile, userinfo } = await requestProfile(provider, tokens);

    // Called with the whole token set so openid-client checks the userinfo
    // `sub` against the ID token's.
    expect(userinfo).toHaveBeenCalledWith(tokens);
    // Claims the ID token does not carry are picked up from userinfo.
    expect(provider.profile(profile as any, tokens as any)).toMatchObject({
      id: "user-1",
      email: "user@example.com",
      name: "Some User",
    });
  });

  it("keeps ID token claims that userinfo omits", async () => {
    const provider = CustomSSOProvider({ ...baseOptions, fetchUserInfo: true });

    const { profile } = await requestProfile(
      provider,
      fakeTokenSet(),
      vi.fn(async () => ({ sub: "user-1", email: "user@example.com" })),
    );

    expect(profile).toMatchObject({
      sub: "user-1",
      iss: baseOptions.issuer,
      email: "user@example.com",
    });
  });

  it("does not read ID token claims when the token response has none", async () => {
    const provider = CustomSSOProvider({ ...baseOptions, fetchUserInfo: true });

    // openid-client throws on `claims()` without an id_token, so it must not
    // be called on the plain OAuth2 path.
    const claims = vi.fn(() => {
      throw new Error("id_token not present in TokenSet");
    });

    const { profile } = await requestProfile(
      provider,
      fakeTokenSet({ id_token: undefined, claims }),
    );

    expect(claims).not.toHaveBeenCalled();
    expect(profile).toMatchObject({ email: "user@example.com" });
  });

  it("leaves the token exchange untouched and keeps fetchUserInfo out of the NextAuth options", () => {
    const provider = CustomSSOProvider({
      ...baseOptions,
      idToken: true,
      fetchUserInfo: true,
    });

    // `idToken: true` keeps NextAuth on client.callback(), which is the only
    // callback openid-client accepts once the token response has an id_token.
    expect(provider.options).toMatchObject({ idToken: true });
    expect(provider.options).not.toHaveProperty("fetchUserInfo");
  });
});
