import { type InternalServerError } from "@langfuse/shared";
import {
  type PrismaClient,
  type User,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";

import { internalServerError, type ErrorResult, type Success } from "./types";

/** UserRepository reads a user's profile without its password hash, returning a null miss or an infra failure as a value. */
export class UserRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /** getUser loads the user with userId and whether they have set a password, carrying a null miss on success. */
  async getUser(userId: string): Promise<GetUserResult> {
    try {
      const row = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
          featureFlags: true,
          v4BetaEnabled: true,
          sessionsExpiredAt: true,
          password: true,
        },
      });
      return { success: true, user: toUserRecord(row) };
    } catch (error) {
      return internalServerError(
        `failed to load user ${userId}: ${String(error)}`,
      );
    }
  }
}

/** toUserRecord swaps a loaded row's password hash for whether one is set. */
function toUserRecord(row: UserRow | null): UserRecord | null {
  if (!row) return null;
  const { password, ...profile } = row;
  return { ...profile, hasPassword: Boolean(password) };
}

/** UserRow is the selected user columns, including the password hash. */
type UserRow = Pick<
  User,
  | "id"
  | "email"
  | "name"
  | "image"
  | "createdAt"
  | "featureFlags"
  | "v4BetaEnabled"
  | "sessionsExpiredAt"
  | "password"
>;

/** UserRecord is a user's profile and session revocation time, never their password hash. */
export type UserRecord = Omit<UserRow, "password"> & { hasPassword: boolean };

/** GetUserResult is the loaded user or a null miss, or an infra failure. */
type GetUserResult =
  | (Success & { user: UserRecord | null })
  | ErrorResult<InternalServerError>;
