import { randomUUID } from "crypto";
import type * as CryptoModule from "crypto";
import { hash } from "bcryptjs";
import { rehashPasswordIfNeeded } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { verifyPassword } from "@/src/features/auth-credentials/lib/passwordHash";
import { prisma } from "@langfuse/shared/src/db";

const { getFips } = vi.hoisted(() => ({ getFips: vi.fn() }));

vi.mock("crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof CryptoModule>()),
  getFips,
}));

const PASSWORD = "Loginpass1!";

describe("rehashPasswordIfNeeded", () => {
  beforeEach(() => {
    getFips.mockReset();
    getFips.mockReturnValue(1);
  });

  it("upgrades a bcrypt hash to PBKDF2 on a FIPS host without ending sessions", async () => {
    const { userId, bcryptHash } = await createBcryptUser();

    await rehashPasswordIfNeeded({
      userId,
      password: PASSWORD,
      verifiedHash: bcryptHash,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { password: true, sessionsExpiredAt: true },
    });
    expect(user.password).toMatch(/^\$pbkdf2-sha256\$/);
    expect(await verifyPassword(PASSWORD, user.password!)).toBe(true);
    expect(user.sessionsExpiredAt).toBeNull();
  });

  it("keeps a password that changed after it was verified", async () => {
    const { userId, bcryptHash } = await createBcryptUser();
    const changedHash = await hash("Changedpass1!", 4);
    await prisma.user.update({
      where: { id: userId },
      data: { password: changedHash },
    });

    await rehashPasswordIfNeeded({
      userId,
      password: PASSWORD,
      verifiedHash: bcryptHash,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { password: true },
    });
    expect(user.password).toBe(changedHash);
  });

  it("leaves bcrypt hashes alone when the FIPS provider is inactive", async () => {
    getFips.mockReturnValue(0);
    const { userId, bcryptHash } = await createBcryptUser();

    await rehashPasswordIfNeeded({
      userId,
      password: PASSWORD,
      verifiedHash: bcryptHash,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { password: true },
    });
    expect(user.password).toBe(bcryptHash);
  });
});

async function createBcryptUser() {
  const id = randomUUID();
  const bcryptHash = await hash(PASSWORD, 4);
  const user = await prisma.user.create({
    data: {
      id: `user-${id}`,
      email: `user-${id}@example.com`,
      name: "Password Rehash Test User",
      password: bcryptHash,
    },
  });
  return { userId: user.id, bcryptHash };
}
