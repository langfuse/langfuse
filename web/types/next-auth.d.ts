import { type DefaultSession, type DefaultUser } from "next-auth";
import {
  type User as PrismaUser,
  type Membership as PrismaMembership,
  type Project as PrismaProject,
} from "@langfuse/shared/src/db";
import { type Flags } from "@/src/features/feature-flags/types";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: User | null; // null if user does not exist anymore in the database but has active jwt
    environment: {
      // Run-time environment variables that need to be available client-side
      enableExperimentalFeatures: boolean;
      disableExpensivePostgresQueries: boolean;
      defaultTableDateTimeOffset?: number;
    };
  }

  interface User extends DefaultUser {
    id: PrismaUser["id"];
    name?: PrismaUser["name"];
    email?: PrismaUser["email"];
    image?: PrismaUser["image"];
    admin?: PrismaUser["admin"];
    emailVerified?: PrismaUser["emailVerified"];
    projects: {
      id: PrismaProject["id"];
      name: PrismaProject["name"];
      role: PrismaMembership["role"];
    }[];
    featureFlags: Flags;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }
}
