import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { prisma } from "@langfuse/shared/src/db";
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
    throw new Error(
      user.password !== null
        ? "User with email already exists. Please sign in."
        : "You have already signed up via an identity provider. Please sign in.",
    );
  }

  const newUser = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
    },
  });

  await createProjectMembershipsOnSignup(newUser);

  return newUser.id;
}

export async function updateUserPassword(userId: string, password: string) {
  if (!isValidPassword(password))
    throw new Error("Password needs to be at least 8 characters long.");

  const hashedPassword = await hashPassword(password);
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      password: hashedPassword,
    },
  });
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
