import type * as CryptoModule from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";
import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "@/src/features/auth-credentials/lib/passwordHash";

const { getFips } = vi.hoisted(() => ({ getFips: vi.fn() }));

vi.mock("crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof CryptoModule>()),
  getFips,
}));

const PASSWORD = "correct horse battery staple";

describe("passwordHash", () => {
  beforeEach(() => {
    getFips.mockReset();
    getFips.mockReturnValue(0);
  });

  it("writes bcrypt hashes when the FIPS provider is inactive", async () => {
    const hashed = await hashPassword(PASSWORD);

    expect(hashed).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword(PASSWORD, hashed)).toBe(true);
    expect(passwordNeedsRehash(hashed)).toBe(false);
  });

  it("writes PBKDF2-SHA256 hashes under the FIPS provider", async () => {
    getFips.mockReturnValue(1);

    const hashed = await hashPassword(PASSWORD);

    expect(hashed).toMatch(
      /^\$pbkdf2-sha256\$i=600000\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    expect(await verifyPassword(PASSWORD, hashed)).toBe(true);
    expect(await verifyPassword(`${PASSWORD}!`, hashed)).toBe(false);
    // Login forwards whatever was submitted; short input must not throw.
    expect(await verifyPassword("", hashed)).toBe(false);
    expect(passwordNeedsRehash(hashed)).toBe(false);
  });

  it("verifies both formats regardless of the provider", async () => {
    getFips.mockReturnValue(1);
    const pbkdf2Hash = await hashPassword(PASSWORD);
    getFips.mockReturnValue(0);
    const bcryptHash = await hashPassword(PASSWORD);

    for (const fips of [0, 1]) {
      getFips.mockReturnValue(fips);
      expect(await verifyPassword(PASSWORD, pbkdf2Hash)).toBe(true);
      expect(await verifyPassword(PASSWORD, bcryptHash)).toBe(true);
    }
  });

  it("asks FIPS hosts to rehash bcrypt and weaker PBKDF2 hashes", async () => {
    const bcryptHash = await hash(PASSWORD, 4);
    getFips.mockReturnValue(1);
    const weakerPbkdf2Hash = (await hashPassword(PASSWORD)).replace(
      "i=600000",
      "i=1000",
    );

    expect(passwordNeedsRehash(bcryptHash)).toBe(true);
    expect(passwordNeedsRehash(weakerPbkdf2Hash)).toBe(true);
  });

  it.each([
    ["an empty value", ""],
    ["a plain string", PASSWORD],
    ["a missing key", "$pbkdf2-sha256$i=600000$AAAAAAAAAAAAAAAAAAAAAA"],
    [
      "a non-numeric iteration count",
      "$pbkdf2-sha256$i=many$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ],
    [
      "an iteration count below the SP 800-132 minimum",
      "$pbkdf2-sha256$i=999$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ],
    [
      "a salt below the SP 800-132 minimum",
      "$pbkdf2-sha256$i=600000$AAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ],
  ])("rejects %s without throwing", async (_label, stored) => {
    expect(await verifyPassword(PASSWORD, stored)).toBe(false);
  });
});
