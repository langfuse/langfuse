import { createHash, randomInt, randomUUID } from "crypto";
import type { Session } from "next-auth";

import { env } from "@/src/env.mjs";
import {
  hashPassword,
  verifyPassword,
} from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";

const OLD_PASSWORD = "Oldpass1!";
const NEW_PASSWORD = "Newpass1!";

describe("credentials.resetPassword", () => {
  it("rejects a password overwrite authorized only by a fresh email verification timestamp", async () => {
    const { caller, userId, email } = await createPasswordUser({
      emailVerified: new Date(),
    });

    await expect(
      caller.credentials.resetPassword({
        email,
        token: uniqueOtp(),
        password: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expectPassword(userId, OLD_PASSWORD);
  });

  it("consumes the account-bound OTP while updating the password", async () => {
    const { caller, userId, email } = await createPasswordUser();
    const token = uniqueOtp();
    await insertOtp({ email, token });

    await caller.credentials.resetPassword({
      email,
      token,
      password: NEW_PASSWORD,
    });

    await expectPassword(userId, NEW_PASSWORD);
    await expect(
      caller.credentials.resetPassword({
        email,
        token,
        password: "Another1!",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows only one concurrent password update per OTP", async () => {
    const { caller, userId, email } = await createPasswordUser();
    const token = uniqueOtp();
    await insertOtp({ email, token });

    const results = await Promise.allSettled([
      caller.credentials.resetPassword({
        email,
        token,
        password: NEW_PASSWORD,
      }),
      caller.credentials.resetPassword({
        email,
        token,
        password: "Another1!",
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { password: true },
    });
    const hasWinningPassword =
      (await verifyPassword(NEW_PASSWORD, user.password!)) ||
      (await verifyPassword("Another1!", user.password!));
    expect(hasWinningPassword).toBe(true);
  });

  it("does not let another account's session use the OTP", async () => {
    const victim = await createPasswordUser();
    const attacker = await createPasswordUser();
    const token = uniqueOtp();
    await insertOtp({ email: victim.email, token });

    await expect(
      attacker.caller.credentials.resetPassword({
        email: victim.email,
        token,
        password: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expectPassword(victim.userId, OLD_PASSWORD);
  });

  it("supports forgot-password with email and OTP when logged out", async () => {
    const { userId, email } = await createPasswordUser();
    const token = uniqueOtp();
    await insertOtp({ email, token });
    const ctx = createInnerTRPCContext({ session: null, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    await caller.credentials.resetPassword({
      email,
      token,
      password: NEW_PASSWORD,
    });

    await expectPassword(userId, NEW_PASSWORD);
  });

  it("rejects an expired OTP", async () => {
    const { caller, userId, email } = await createPasswordUser();
    const token = uniqueOtp();
    await insertOtp({
      email,
      token,
      expires: new Date(Date.now() - 1),
    });

    await expect(
      caller.credentials.resetPassword({
        email,
        token,
        password: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expectPassword(userId, OLD_PASSWORD);
  });
});

function uniqueOtp() {
  return randomInt(100000, 1000000).toString();
}

function hashEmailOtpToken(token: string) {
  return createHash("sha256")
    .update(`${token}${env.NEXTAUTH_SECRET ?? ""}`)
    .digest("hex");
}

async function insertOtp({
  email,
  token,
  expires = new Date(Date.now() + 3 * 60 * 1000),
}: {
  email: string;
  token: string;
  expires?: Date;
}) {
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: hashEmailOtpToken(token),
      expires,
    },
  });
}

async function expectPassword(userId: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { password: true },
  });
  expect(await verifyPassword(password, user.password!)).toBe(true);
}

async function createPasswordUser({
  emailVerified = null,
}: {
  emailVerified?: Date | null;
} = {}) {
  const id = randomUUID();
  const email = `user-${id}@example.com`;
  const user = await prisma.user.create({
    data: {
      id: `user-${id}`,
      email,
      name: "Password Reset Test User",
      password: await hashPassword(OLD_PASSWORD),
      emailVerified,
    },
  });
  const session: Session = {
    expires: "1",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      canCreateOrganizations: true,
      organizations: [],
      featureFlags: {
        searchBar: false,
        templateFlag: false,
        excludeClickhouseRead: false,
        observationEvals: false,
        v4BetaToggleVisible: false,
        experimentsV4Enabled: false,
      },
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:enterprise",
    },
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });

  return {
    userId: user.id,
    email,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}
