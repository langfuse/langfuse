import { prisma } from "@langfuse/shared/src/db";
import { createUserEmailPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { v4 } from "uuid";

describe("createUserEmailPassword", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length === 0) return;
    // Memberships are only created when default orgs/projects are configured;
    // clear them defensively so the user row can be deleted regardless.
    await prisma.organizationMembership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("trims and lowercases the email before storing it (#15780)", async () => {
    const unique = v4().slice(0, 8);
    const rawEmail = `  Whitespace.${unique}@Example.com  `;
    const expected = `whitespace.${unique}@example.com`;

    const userId = await createUserEmailPassword(
      rawEmail,
      "password123",
      "Test User",
    );
    createdUserIds.push(userId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.email).toBe(expected);
  });

  it("treats a whitespace-padded duplicate as the same existing user (#15780)", async () => {
    const unique = v4().slice(0, 8);
    const email = `dup.${unique}@example.com`;

    const userId = await createUserEmailPassword(
      email,
      "password123",
      "Test User",
    );
    createdUserIds.push(userId);

    await expect(
      createUserEmailPassword(`  ${email}  `, "password123", "Test User"),
    ).rejects.toThrow(/already exists/i);
  });
});
