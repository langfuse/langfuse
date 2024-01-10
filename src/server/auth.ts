import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type User,
  type NextAuthOptions,
  type Session,
} from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/src/server/db";
import { verifyPassword } from "@/src/features/auth/lib/emailPassword";
import { parseFlags } from "@/src/features/feature-flags/utils";
import { env } from "@/src/env.mjs";
import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { type Adapter } from "next-auth/adapters";

// Providers
import { type Provider } from "next-auth/providers";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import AzureADProvider from "next-auth/providers/azure-ad";

// Use secure cookies on https hostnames, exception for Vercel which sets NEXTAUTH_URL without the protocol
const useSecureCookies =
  env.NEXTAUTH_URL.startsWith("https://") || process.env.VERCEL === "1";

const cookieOptions = {
  domain: env.NEXTAUTH_COOKIE_DOMAIN ?? undefined,
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: useSecureCookies,
};

const cookieName = (name: string) =>
  [
    useSecureCookies ? "__Secure-" : "",
    name,
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      ? `.${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}`
      : "",
  ].join("");

const providers: Provider[] = [
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: {
        label: "Email",
        type: "email",
        placeholder: "jsmith@example.com",
      },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, _req) {
      if (!credentials) throw new Error("No credentials");
      if (env.AUTH_DISABLE_USERNAME_PASSWORD === "true")
        throw new Error(
          "Sign in with email and password is disabled for this instance. Please use SSO.",
        );

      const blockedDomains =
        env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT?.split(",") ?? [];
      const domain = credentials.email.split("@")[1]?.toLowerCase();
      if (domain && blockedDomains.includes(domain)) {
        throw new Error(
          "Sign in with email and password is disabled for this domain. Please use SSO.",
        );
      }

      const dbUser = await prisma.user.findUnique({
        where: {
          email: credentials.email.toLowerCase(),
        },
      });

      if (!dbUser) throw new Error("Invalid credentials");
      if (dbUser.password === null) throw new Error("Invalid credentials");

      const isValidPassword = await verifyPassword(
        credentials.password,
        dbUser.password,
      );
      if (!isValidPassword) throw new Error("Invalid credentials");

      const userObj: User = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        image: dbUser.image,
        emailVerified: dbUser.emailVerified,
        featureFlags: parseFlags(dbUser.featureFlags),
        projects: [],
      };

      return userObj;
    },
  }),
];

if (env.AUTH_GOOGLE_CLIENT_ID && env.AUTH_GOOGLE_CLIENT_SECRET)
  providers.push(
    GoogleProvider({
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );

if (env.AUTH_GITHUB_CLIENT_ID && env.AUTH_GITHUB_CLIENT_SECRET)
  providers.push(
    GitHubProvider({
      clientId: env.AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );

if (
  env.AUTH_AZURE_AD_CLIENT_ID &&
  env.AUTH_AZURE_AD_CLIENT_SECRET &&
  env.AUTH_AZURE_AD_TENANT_ID
)
  providers.push(
    AzureADProvider({
      clientId: env.AUTH_AZURE_AD_CLIENT_ID,
      clientSecret: env.AUTH_AZURE_AD_CLIENT_SECRET,
      tenantId: env.AUTH_AZURE_AD_TENANT_ID,
    }),
  );

// Extend Prisma Adapter
const prismaAdapter = PrismaAdapter(prisma);
const extendedPrismaAdapter: Adapter = {
  ...prismaAdapter,
  async createUser(profile) {
    if (!prismaAdapter.createUser)
      throw new Error("createUser not implemented");
    if (env.NEXT_PUBLIC_SIGN_UP_DISABLED === "true") {
      throw new Error("Sign up is disabled.");
    }
    if (!profile.email) {
      throw new Error(
        "Cannot create db user as login profile does not contain an email: " +
          JSON.stringify(profile),
      );
    }

    const user = await prismaAdapter.createUser(profile);

    await createProjectMembershipsOnSignup(user);

    return user;
  },
};

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }): Promise<Session> {
      const dbUser = await prisma.user.findUnique({
        where: {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          email: token.email!.toLowerCase(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          featureFlags: true,
          admin: true,
          memberships: {
            include: {
              project: true,
            },
          },
        },
      });

      return {
        ...session,
        user:
          dbUser !== null
            ? {
                ...session.user,
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                image: dbUser.image,
                admin: dbUser.admin,
                projects: dbUser.memberships.map((membership) => ({
                  id: membership.project.id,
                  name: membership.project.name,
                  role: membership.role,
                })),
                featureFlags: parseFlags(dbUser.featureFlags),
              }
            : null,
      };
    },
  },
  adapter: extendedPrismaAdapter,
  providers,
  pages: {
    signIn: "/auth/sign-in",
    ...(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      ? {
          newUser: "/onboarding",
        }
      : {}),
  },
  cookies: {
    sessionToken: {
      name: cookieName("next-auth.session-token"),
      options: cookieOptions,
    },
    csrfToken: {
      name: cookieName("next-auth.csrf-token"),
      options: cookieOptions,
    },
    callbackUrl: {
      name: cookieName("next-auth.callback-url"),
      options: cookieOptions,
    },
    state: {
      name: cookieName("next-auth.state"),
      options: cookieOptions,
    },
    nonce: {
      name: cookieName("next-auth.nonce"),
      options: cookieOptions,
    },
    pkceCodeVerifier: {
      name: cookieName("next-auth.pkce.code_verifier"),
      options: cookieOptions,
    },
  },
  events: {
    createUser: async ({ user }) => {
      if (
        env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK &&
        env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
        env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "STAGING"
      ) {
        await fetch(env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK, {
          method: "POST",
          body: JSON.stringify({
            name: user.name,
            email: user.email,
            cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
            userId: user.id,
            // referralSource: ...
          }),
          headers: {
            "Content-Type": "application/json",
          },
        });
      }
    },
  },
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};
