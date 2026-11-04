import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, type JWK } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import {
  resolveOAuth2Profile,
  type OAuth2Config,
} from "../../../interfaces/oauth2Providers";
import {
  getOAuth2DisplaySecretKey,
  prepareOAuth2Credential,
} from "./credential";
import { OAuth2TokenError } from "./errors";

const customProfile = (
  overrides: Partial<Extract<OAuth2Config, { provider: "custom" }>> = {},
) =>
  resolveOAuth2Profile({
    provider: "custom",
    clientId: "client-1",
    authMethod: "private_key_jwt",
    tokenEndpoint: "https://idp.example.com/oauth2/token",
    ...overrides,
  });

const entraProfile = () =>
  resolveOAuth2Profile({
    provider: "entra",
    clientId: "client-1",
    authMethod: "private_key_jwt",
    tenantId: "tenant-1",
    scope: "api://gateway/.default",
  });

async function privateJwk(alg: string, crv?: string): Promise<JWK> {
  const { privateKey } = await generateKeyPair(alg, {
    extractable: true,
    ...(crv ? { crv } : {}),
  });
  return exportJWK(privateKey);
}

async function expectConfigError(
  promise: Promise<unknown>,
  message: string | RegExp,
): Promise<OAuth2TokenError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(OAuth2TokenError);
  const tokenError = error as OAuth2TokenError;
  expect(tokenError.kind).toBe("config");
  if (typeof message === "string") {
    expect(tokenError.message).toBe(message);
  } else {
    expect(tokenError.message).toMatch(message);
  }
  return tokenError;
}

describe("prepareOAuth2Credential", () => {
  let rsaJwk: JWK;
  let ec256Jwk: JWK;
  let ec384Jwk: JWK;

  beforeAll(async () => {
    [rsaJwk, ec256Jwk, ec384Jwk] = await Promise.all([
      privateJwk("RS256"),
      privateJwk("ES256"),
      privateJwk("ES384"),
    ]);
  });

  describe("private_key_jwt algorithm", () => {
    test("RSA JWK without alg defaults to RS256 for custom", async () => {
      const prepared = await prepareOAuth2Credential(
        customProfile(),
        JSON.stringify(rsaJwk),
      );
      expect(prepared.algorithm).toBe("RS256");
      expect(prepared.signingKey).toBeDefined();
      expect(prepared.secret).toBeUndefined();
    });

    test("RSA JWK without alg defaults to PS256 for Entra", async () => {
      const prepared = await prepareOAuth2Credential(
        entraProfile(),
        JSON.stringify({ ...rsaJwk, "x5t#S256": "thumb" }),
      );
      expect(prepared.algorithm).toBe("PS256");
    });

    test("JWK alg wins over the profile default", async () => {
      const prepared = await prepareOAuth2Credential(
        customProfile(),
        JSON.stringify({ ...rsaJwk, alg: "RS384" }),
      );
      expect(prepared.algorithm).toBe("RS384");
    });

    test("config assertionAlgorithm wins over JWK alg", async () => {
      const prepared = await prepareOAuth2Credential(
        customProfile({ assertionAlgorithm: "RS512" }),
        JSON.stringify({ ...rsaJwk, alg: "RS384" }),
      );
      expect(prepared.algorithm).toBe("RS512");
    });

    test("EC P-256 JWK resolves to ES256", async () => {
      const prepared = await prepareOAuth2Credential(
        customProfile(),
        JSON.stringify(ec256Jwk),
      );
      expect(prepared.algorithm).toBe("ES256");
    });

    test("EC P-384 JWK resolves to ES384", async () => {
      const prepared = await prepareOAuth2Credential(
        customProfile(),
        JSON.stringify(ec384Jwk),
      );
      expect(prepared.algorithm).toBe("ES384");
    });

    test("EC P-384 JWK with ES256 is a config error", async () => {
      await expectConfigError(
        prepareOAuth2Credential(
          customProfile({ assertionAlgorithm: "ES256" }),
          JSON.stringify(ec384Jwk),
        ),
        /ES256 requires an EC key on curve P-256/,
      );
    });

    test("RSA JWK with ES256 is a config error", async () => {
      await expectConfigError(
        prepareOAuth2Credential(
          customProfile({ assertionAlgorithm: "ES256" }),
          JSON.stringify(rsaJwk),
        ),
        /ES256 requires an EC key/,
      );
    });

    test("EC JWK with an RSA algorithm is a config error", async () => {
      await expectConfigError(
        prepareOAuth2Credential(
          customProfile(),
          JSON.stringify({ ...ec256Jwk, alg: "RS256" }),
        ),
        /RS256 requires an RSA key/,
      );
    });

    test("unsupported JWK alg is a config error", async () => {
      await expectConfigError(
        prepareOAuth2Credential(
          customProfile(),
          JSON.stringify({ ...rsaJwk, alg: "HS256" }),
        ),
        /JWK alg must be one of/,
      );
    });
  });

  describe("private_key_jwt JWK parsing", () => {
    test("public-only JWK is rejected", async () => {
      const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...pub } = rsaJwk;
      await expectConfigError(
        prepareOAuth2Credential(customProfile(), JSON.stringify(pub)),
        /private JWK required/i,
      );
    });

    test("OKP JWK is rejected", async () => {
      const okpJwk = await privateJwk("EdDSA", "Ed25519");
      await expectConfigError(
        prepareOAuth2Credential(customProfile(), JSON.stringify(okpJwk)),
        /unsupported kty/i,
      );
    });

    test("invalid JSON is rejected", async () => {
      await expectConfigError(
        prepareOAuth2Credential(customProfile(), "-----BEGIN PRIVATE KEY-----"),
        /JSON/,
      );
    });

    test("non-object JSON is rejected", async () => {
      await expectConfigError(
        prepareOAuth2Credential(customProfile(), "[1, 2]"),
        /JSON object/,
      );
    });

    test("JWKS is rejected with a hint to paste a single JWK", async () => {
      await expectConfigError(
        prepareOAuth2Credential(
          customProfile(),
          JSON.stringify({ keys: [rsaJwk] }),
        ),
        'Paste a single private JWK, not a JWKS ({"keys": [...]})',
      );
    });

    test("surrounding whitespace and newlines are accepted", async () => {
      const prepared = await prepareOAuth2Credential(
        customProfile(),
        `\n  ${JSON.stringify(rsaJwk, null, 2)}\n\n  `,
      );
      expect(prepared.algorithm).toBe("RS256");
    });

    test("key material that fails to import is a config error", async () => {
      await expectConfigError(
        prepareOAuth2Credential(
          customProfile(),
          JSON.stringify({ ...rsaJwk, e: undefined }),
        ),
        "The private JWK could not be imported",
      );
    });

    test("a key that cannot sign (1024-bit RSA) is a config error", async () => {
      const weakJwk = generateKeyPairSync("rsa", {
        modulusLength: 1024,
      }).privateKey.export({ format: "jwk" });

      const error = await expectConfigError(
        prepareOAuth2Credential(customProfile(), JSON.stringify(weakJwk), {
          verifySigning: true,
        }),
        "Could not sign the client assertion with the configured key",
      );
      expect(error.cause).toBeUndefined();
    });

    test("error messages never contain JWK values", async () => {
      const secretValues = [rsaJwk.d, rsaJwk.n, rsaJwk.p] as string[];
      const badInputs = [
        JSON.stringify({ ...rsaJwk, alg: "ES256" }),
        JSON.stringify({ ...rsaJwk, kty: "OKP" }),
        JSON.stringify({ keys: [rsaJwk] }),
        JSON.stringify(rsaJwk).slice(0, -1),
        JSON.stringify({ ...rsaJwk, e: undefined }),
      ];
      for (const input of badInputs) {
        const error = await expectConfigError(
          prepareOAuth2Credential(customProfile(), input),
          /.+/,
        );
        for (const value of secretValues) {
          expect(error.message).not.toContain(value);
        }
        expect(error.cause).toBeUndefined();
      }
    });
  });

  describe("private_key_jwt protected header", () => {
    test("copies kid when present", async () => {
      const prepared = await prepareOAuth2Credential(
        customProfile(),
        JSON.stringify({ ...rsaJwk, kid: "agent-x" }),
      );
      expect(prepared.protectedHeader).toEqual({ kid: "agent-x" });
    });

    test("omits kid when absent", async () => {
      const prepared = await prepareOAuth2Credential(
        customProfile(),
        JSON.stringify(rsaJwk),
      );
      expect(prepared.protectedHeader).toEqual({});
    });

    test("copies thumbprints for non-Entra providers only when present", async () => {
      const prepared = await prepareOAuth2Credential(
        customProfile(),
        JSON.stringify({ ...rsaJwk, "x5t#S256": "s256", x5t: "sha1" }),
      );
      expect(prepared.protectedHeader).toEqual({
        "x5t#S256": "s256",
        x5t: "sha1",
      });
    });

    test("Entra uses the x5t#S256 member", async () => {
      const prepared = await prepareOAuth2Credential(
        entraProfile(),
        JSON.stringify({ ...rsaJwk, kid: "k1", "x5t#S256": "member-thumb" }),
      );
      expect(prepared.protectedHeader).toEqual({
        kid: "k1",
        "x5t#S256": "member-thumb",
      });
    });

    test("Entra computes x5t#S256 from x5c[0]", async () => {
      const der = randomBytes(64);
      const prepared = await prepareOAuth2Credential(
        entraProfile(),
        JSON.stringify({ ...rsaJwk, x5c: [der.toString("base64")] }),
      );
      expect(prepared.protectedHeader).toEqual({
        "x5t#S256": createHash("sha256").update(der).digest("base64url"),
      });
    });

    test("Entra without x5t#S256 or x5c is a config error", async () => {
      await expectConfigError(
        prepareOAuth2Credential(entraProfile(), JSON.stringify(rsaJwk)),
        /x5t#S256/,
      );
    });

    test("Entra with a malformed x5c is a config error", async () => {
      await expectConfigError(
        prepareOAuth2Credential(
          entraProfile(),
          JSON.stringify({ ...rsaJwk, x5c: ["not base64!"] }),
        ),
        /x5c/,
      );
    });
  });

  describe("client_secret_jwt", () => {
    const hmacProfile = (assertionAlgorithm?: "HS256" | "HS384" | "HS512") =>
      customProfile({
        authMethod: "client_secret_jwt",
        ...(assertionAlgorithm ? { assertionAlgorithm } : {}),
      });

    test("HS256 with a 31-byte secret is a config error", async () => {
      await expectConfigError(
        prepareOAuth2Credential(hmacProfile(), "a".repeat(31)),
        "Client secret must be at least 32 bytes for HS256",
      );
    });

    test("HS256 with a 32-byte secret resolves to raw HMAC key bytes", async () => {
      const secret = "a".repeat(32);
      const prepared = await prepareOAuth2Credential(hmacProfile(), secret);
      expect(prepared.algorithm).toBe("HS256");
      expect(prepared.signingKey).toEqual(new TextEncoder().encode(secret));
      expect(prepared.protectedHeader).toBeUndefined();
    });

    test("HS512 needs a 64-byte secret", async () => {
      await expectConfigError(
        prepareOAuth2Credential(hmacProfile("HS512"), "a".repeat(63)),
        "Client secret must be at least 64 bytes for HS512",
      );
      const prepared = await prepareOAuth2Credential(
        hmacProfile("HS512"),
        "a".repeat(64),
      );
      expect(prepared.algorithm).toBe("HS512");
    });
  });

  describe("client_secret_basic and client_secret_post", () => {
    test("returns the secret", async () => {
      const prepared = await prepareOAuth2Credential(
        customProfile({ authMethod: "client_secret_post" }),
        "s3cret",
      );
      expect(prepared.secret).toBe("s3cret");
      expect(prepared.signingKey).toBeUndefined();
      expect(prepared.algorithm).toBeUndefined();
    });

    test("empty secret is a config error", async () => {
      await expectConfigError(
        prepareOAuth2Credential(
          customProfile({ authMethod: "client_secret_basic" }),
          "  ",
        ),
        "Client secret is required",
      );
    });
  });

  test("fingerprint is the sha256 hex of the raw secret", async () => {
    const raw = `\n${JSON.stringify(rsaJwk)}\n`;
    const prepared = await prepareOAuth2Credential(customProfile(), raw);
    expect(prepared.fingerprint).toBe(
      createHash("sha256").update(raw).digest("hex"),
    );
  });
});

describe("getOAuth2DisplaySecretKey", () => {
  test("shows the kid of a private JWK", () => {
    expect(
      getOAuth2DisplaySecretKey(
        "private_key_jwt",
        JSON.stringify({ kty: "RSA", kid: "agent-x", d: "secret" }),
      ),
    ).toBe("kid:agent-x");
  });

  test("shows kid:none for a JWK without kid", () => {
    expect(
      getOAuth2DisplaySecretKey(
        "private_key_jwt",
        JSON.stringify({ kty: "RSA", d: "secret" }),
      ),
    ).toBe("kid:none");
  });

  test("shows kid:none for unparsable input", () => {
    expect(getOAuth2DisplaySecretKey("private_key_jwt", "not json")).toBe(
      "kid:none",
    );
  });

  test("shows the last four characters of a client secret", () => {
    expect(getOAuth2DisplaySecretKey("client_secret_post", "abcdefgh")).toBe(
      "...efgh",
    );
  });
});
