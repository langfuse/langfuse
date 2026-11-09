import { randomUUID } from "crypto";
import { hash } from "bcryptjs";
import type { CredentialsConfig } from "next-auth/providers/credentials";
import type * as SharedEnvModule from "@langfuse/shared/src/env";
import { PASSWORD_RESET_REQUIRED_MESSAGE } from "@/src/features/auth/constants";
import { hashPassword } from "@/src/features/auth-credentials/lib/passwordHash";
import { getAuthOptions } from "@/src/server/auth";
import { prisma } from "@langfuse/shared/src/db";

const { fips } = vi.hoisted(() => ({
  fips: { required: "false" as "true" | "false" },
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

const PASSWORD = "Loginpass1!";

describe("credentials login in FIPS mode", () => {
  beforeEach(() => {
    fips.required = "false";
  });

  it("asks a user with a bcrypt password to reset it", async () => {
    const email = await createUser(await hash(PASSWORD, 4));
    fips.required = "true";

    await expect(signIn(email, PASSWORD)).rejects.toThrow(
      PASSWORD_RESET_REQUIRED_MESSAGE,
    );
  });

  it("signs in a user whose password was set in FIPS mode", async () => {
    fips.required = "true";
    const email = await createUser(await hashPassword(PASSWORD));

    await expect(signIn(email, PASSWORD)).resolves.toMatchObject({ email });
    await expect(signIn(email, "Wrongpass1!")).rejects.toThrow(
      "Invalid credentials",
    );
  });

  it("keeps signing in bcrypt users outside FIPS mode", async () => {
    const email = await createUser(await hash(PASSWORD, 4));

    await expect(signIn(email, PASSWORD)).resolves.toMatchObject({ email });
  });
});

async function createUser(passwordHash: string) {
  const id = randomUUID();
  const email = `fips-login-${id}@example.com`;
  await prisma.user.create({
    data: {
      id: `user-${id}`,
      email,
      name: "FIPS Login Test User",
      password: passwordHash,
    },
  });
  return email;
}

async function signIn(email: string, password: string) {
  const provider = (await getAuthOptions()).providers.find(
    (p) => p.id === "credentials",
  );
  const { authorize } = provider?.options as Pick<
    CredentialsConfig,
    "authorize"
  >;
  return authorize(
    { email, password },
    { body: {}, query: {}, headers: {}, method: "POST" },
  );
}
