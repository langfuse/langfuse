import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type User,
  type NextAuthOptions,
  type Session,
} from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/src/server/db";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyPassword } from "@/src/features/auth/lib/emailPassword";
import { parseFlags } from "@/src/features/feature-flags/utils";
import { env } from "@/src/env.mjs";

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
  adapter: PrismaAdapter(prisma),
  providers: [
    /**
     * ...add more providers here.
     *
     * Most other providers require a bit more work than the Discord provider. For example, the
     * GitHub provider requires you to add the `refresh_token_expires_in` field to the Account
     * model. Refer to the NextAuth.js docs for the provider you want to use. Example:
     *
     * @see https://next-auth.js.org/providers/github
     */
    CredentialsProvider({
      // The name to display on the sign in form (e.g. "Sign in with...")
      name: "credentials",
      // `credentials` is used to generate a form on the sign in page.
      // You can specify which fields should be submitted, by adding keys to the `credentials` object.
      // e.g. domain, username, password, 2FA token, etc.
      // You can pass any HTML attribute to the <input> tag through the object.
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
  ],
  pages: {
    signIn: "/auth/sign-in",
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
