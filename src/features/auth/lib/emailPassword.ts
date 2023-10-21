import { env } from "@/src/env.mjs";
import { prisma } from "@/src/server/db";
import { compare, hash } from "bcryptjs";

/**
 * This function creates a user with an email and password.
 * @param {string} email - A string representing the email address of the user that needs to be
 * created.
 * @param {string} password - The `password` parameter is a string that represents the password that
 * the user wants to use for their account. It will be used to authenticate the user when they log in
 * to their account.
 * @returns {Promise<string>} - A promise that resolves to the id of the user that was created.
 */
export async function createUserEmailPassword(
  email: string,
  password: string,
  name: string,
) {
  if (!isValidPassword(password))
    throw new Error("Password needs to be at least 8 characters long.");

  const hashedPassword = await hashPassword(password);
  // check that no user exists with this email
  const user = await prisma.user.findUnique({
    where: {
      email: email.toLowerCase(),
    },
  });
  if (user !== null) {
    throw new Error("User with email already exists. Please sign in.");
  }

  // set demoProjectId if env exists and project exists in db
  const demoProjectId = env.NEXT_PUBLIC_DEMO_PROJECT_ID
    ? (
        await prisma.project.findUnique({
          where: {
            id: env.NEXT_PUBLIC_DEMO_PROJECT_ID,
          },
        })
      )?.id
    : undefined;

  const newUser = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      // if demo project id is set grant user access to it
      ...(demoProjectId
        ? {
            memberships: {
              create: {
                projectId: demoProjectId,
                role: "VIEWER",
              },
            },
          }
        : undefined),
    },
  });
  return newUser.id;
}

export async function hashPassword(password: string) {
  const hashedPassword = await hash(password, 12);
  return hashedPassword;
}

export async function verifyPassword(password: string, hashedPassword: string) {
  const isValid = await compare(password, hashedPassword);
  return isValid;
}

export function isValidPassword(password: string) {
  return password.length >= 8;
}
