import { type DefaultSession, type DefaultUser } from "next-auth";
import {
  type User as PrismaUser,
  type Membership as PrismaMembership,
  type Organization as PrismaOrganization,
} from "@prisma/client";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: User;
  }

  interface User extends DefaultUser {
    id: PrismaUser["id"];
    name?: PrismaUser["name"];
    email?: PrismaUser["email"];
    image?: PrismaUser["image"];
    emailVerified?: PrismaUser["emailVerified"];
    organizations?: {
      id: PrismaOrganization["id"];
      name: PrismaOrganization["name"];
      role: PrismaMembership["role"];
    }[];
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
