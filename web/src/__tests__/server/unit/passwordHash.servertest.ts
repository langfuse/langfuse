import type * as BcryptModule from "bcryptjs";
import type * as SharedEnvModule from "@langfuse/shared/src/env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";
import {
  hashPassword,
  passwordRequiresReset,
  verifyPassword,
} from "@/src/features/auth-credentials/lib/passwordHash";

const { fips, compare } = vi.hoisted(() => ({
  fips: { required: "false" as "true" | "false" },
  compare: vi.fn(),
}));

vi.mock("@langfuse/shared/src/env", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedEnvModule>();
  return {
    ...actual,
    env: {
      ...actual.env,
      get LANGFUSE_REQUIRE_FIPS() {
        return fips.required;
      },
    },
  };
});

// bcryptjs is CommonJS, so its functions sit on the default export.
vi.mock("bcryptjs", async (importOriginal) => {
  const { default: actual } = await importOriginal<{
    default: typeof BcryptModule;
  }>();
  compare.mockImplementation(actual.compare);
  return { ...actual, compare, default: { ...actual, compare } };
});

const PASSWORD = "correct horse battery staple";

describe("passwordHash", () => {
  beforeEach(() => {
    fips.required = "false";
    compare.mockClear();
  });

  it("writes and verifies bcrypt hashes outside FIPS mode", async () => {
    const hashed = await hashPassword(PASSWORD);

    expect(hashed).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword(PASSWORD, hashed)).toBe(true);
    expect(passwordRequiresReset(hashed)).toBe(false);
  });

  it("writes and verifies PBKDF2-SHA256 hashes in FIPS mode", async () => {
    fips.required = "true";

    const hashed = await hashPassword(PASSWORD);

    expect(hashed).toMatch(
      /^\$pbkdf2-sha256\$i=600000\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    expect(await verifyPassword(PASSWORD, hashed)).toBe(true);
    expect(await verifyPassword(`${PASSWORD}!`, hashed)).toBe(false);
    // Login forwards whatever was submitted; short input must not throw.
    expect(await verifyPassword("", hashed)).toBe(false);
    expect(passwordRequiresReset(hashed)).toBe(false);
  });

  it("keeps PBKDF2 hashes valid after FIPS mode is turned off", async () => {
    fips.required = "true";
    const hashed = await hashPassword(PASSWORD);
    fips.required = "false";

    expect(await verifyPassword(PASSWORD, hashed)).toBe(true);
  });

  it("rejects bcrypt hashes in FIPS mode without running bcrypt", async () => {
    const bcryptHash = await hash(PASSWORD, 4);
    fips.required = "true";

    expect(await verifyPassword(PASSWORD, bcryptHash)).toBe(false);
    expect(passwordRequiresReset(bcryptHash)).toBe(true);
    expect(compare).not.toHaveBeenCalled();
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
      "an iteration count Node cannot run",
      "$pbkdf2-sha256$i=9007199254740991$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ],
    [
      "a salt below the SP 800-132 minimum",
      "$pbkdf2-sha256$i=600000$AAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ],
  ])("rejects %s without throwing", async (_label, stored) => {
    for (const required of ["false", "true"] as const) {
      fips.required = required;
      expect(await verifyPassword(PASSWORD, stored)).toBe(false);
    }
  });
});
