import { type DefaultSession, type DefaultUser } from "next-auth";
import {
  type User as PrismaUser,
  type Project as PrismaProject,
  type Organization as PrismaOrganization,
  type Role,
} from "@langfuse/shared/src/db";
import { type Flags } from "@/src/features/feature-flags/types";
import { type CloudConfigSchema } from "@langfuse/shared";
import { type Plan } from "@langfuse/shared";

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
      // Enables features that are only available under an enterprise/commercial license when self-hosting Langfuse
      selfHostedInstancePlan: Plan | null;
    };
  }

  interface User extends DefaultUser {
    id: PrismaUser["id"];
    name?: PrismaUser["name"];
    email?: PrismaUser["email"];
    emailSupportHash?: string | null;
    image?: PrismaUser["image"];
    admin?: PrismaUser["admin"];
    v4BetaEnabled?: boolean;
    emailVerified?: string | null; // iso datetime string, need to stringify as JWT & useSession do not support Date objects
    canCreateOrganizations: boolean; // default true, allowlist can be set via LANGFUSE_ALLOWED_ORGANIZATION_CREATORS
    organizations: {
      id: PrismaOrganization["id"];
      name: PrismaOrganization["name"];
      role: Role;
      cloudConfig: CloudConfigSchema | undefined;
      plan: Plan;
      metadata: Record<string, unknown>;
      aiFeaturesEnabled: boolean;
      projects: {
        id: PrismaProject["id"];
        name: PrismaProject["name"];
        deletedAt: PrismaProject["deletedAt"];
        retentionDays: PrismaProject["retentionDays"];
        hasTraces: PrismaProject["hasTraces"];
        metadata: Record<string, unknown>;
        role: Role; // include only projects where user has a role
      }[];
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
