import { type DefaultSession, type DefaultUser } from "next-auth";
import {
  type User as PrismaUser,
  type Project as PrismaProject,
  type Organization as PrismaOrganization,
} from "@langfuse/shared/src/db";
import { type Flags } from "@/src/features/feature-flags/types";
import { type CloudConfigSchema } from "@/src/features/organizations/utils/cloudConfigSchema";
import { type Plan } from "@/src/features/entitlements/constants/plans";
import { type z } from "zod";
import { type Role } from "@/src/features/rbac/constants/roles";

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
      // Enables features that are only available under an enterprise license when self-hosting Langfuse
      eeEnabled: boolean;
    };
  }

  interface User extends DefaultUser {
    id: PrismaUser["id"];
    name?: PrismaUser["name"];
    email?: PrismaUser["email"];
    image?: PrismaUser["image"];
    admin?: PrismaUser["admin"];
    emailVerified?: string | null; // iso datetime string, need to stringify as JWT & useSession do not support Date objects
    organizations: {
      id: PrismaOrganization["id"];
      role: Role;
      cloudConfig: z.infer<typeof CloudConfigSchema> | undefined;
      projects: {
        id: PrismaProject["id"];
        role: Role;
      }[];
      plan: Plan;
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
