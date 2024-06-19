import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type User,
  type NextAuthOptions,
  type Session,
} from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@langfuse/shared/src/db";
import { verifyPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { parseFlags } from "@/src/features/feature-flags/utils";
import { env } from "@/src/env.mjs";
import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { type Adapter } from "next-auth/adapters";

// Providers
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import OktaProvider from "next-auth/providers/okta";
import EmailProvider from "next-auth/providers/email";
import Auth0Provider from "next-auth/providers/auth0";
import CognitoProvider from "next-auth/providers/cognito";
import AzureADProvider from "next-auth/providers/azure-ad";
import { type Provider } from "next-auth/providers/index";
import { getCookieName, getCookieOptions } from "./utils/cookies";
import {
  getSsoAuthProviderIdForDomain,
  loadSsoProviders,
} from "@langfuse/ee/sso";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  CustomSSOProvider,
  sendResetPasswordVerificationRequest,
} from "@langfuse/shared/src/server";

export const cloudConfigSchema = z.object({
  plan: z.enum(["Hobby", "Pro", "Team", "Enterprise"]).optional(),
  monthlyObservationLimit: z.number().int().positive().optional(),
  // used for table and dashboard queries
  defaultLookBackDays: z.number().int().positive().optional(),
});

const staticProviders: Provider[] = [
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: {
        label: "Email",
        type: "email",
        placeholder: "jsmith@example.com",
      },
      password: { label: "Password", type: "password" },
      turnstileToken: {
        label: "Turnstile Token (Captcha)",
        type: "text",
        value: "dummy",
      },
    },
    async authorize(credentials, _req) {
      if (!credentials) throw new Error("No credentials");
      if (env.AUTH_DISABLE_USERNAME_PASSWORD === "true")
        throw new Error(
          "Sign in with email and password is disabled for this instance. Please use SSO.",
        );

      if (env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
        const res = await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            body: `secret=${encodeURIComponent(env.TURNSTILE_SECRET_KEY)}&response=${encodeURIComponent(credentials.turnstileToken)}`,
            headers: {
              "content-type": "application/x-www-form-urlencoded",
            },
          },
        );
        const data = await res.json();
        if (data.success === false) {
          throw new Error("Invalid captcha token");
        }
      }

      const blockedDomains =
        env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT?.split(",") ?? [];
      const domain = credentials.email.split("@")[1]?.toLowerCase();
      if (domain && blockedDomains.includes(domain)) {
        throw new Error(
          "Sign in with email and password is disabled for this domain. Please use SSO.",
        );
      }

      // EE: Check custom SSO enforcement
      const customSsoProvider = await getSsoAuthProviderIdForDomain(domain);
      if (customSsoProvider) {
        throw new Error(`You must sign in via SSO for this domain.`);
      }

      const dbUser = await prisma.user.findUnique({
        where: {
          email: credentials.email.toLowerCase(),
        },
      });

      if (!dbUser) throw new Error("Invalid credentials");
      if (dbUser.password === null)
        throw new Error(
          "Please sign in with the identity provider that is linked to your account.",
        );

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
        emailVerified: dbUser.emailVerified?.toISOString(),
        featureFlags: parseFlags(dbUser.featureFlags),
        projects: [],
      };

      return userObj;
    },
  }),
];

// Password-reset for password reset of credentials provider
if (env.SMTP_CONNECTION_URL && env.EMAIL_FROM_ADDRESS) {
  staticProviders.push(
    EmailProvider({
      server: env.SMTP_CONNECTION_URL,
      from: env.EMAIL_FROM_ADDRESS,
      sendVerificationRequest: sendResetPasswordVerificationRequest,
    }),
  );
}

if (
  env.AUTH_CUSTOM_CLIENT_ID &&
  env.AUTH_CUSTOM_CLIENT_SECRET &&
  env.AUTH_CUSTOM_ISSUER &&
  env.AUTH_CUSTOM_NAME // name required by front-end, ignored here
)
  staticProviders.push(
    CustomSSOProvider({
      clientId: env.AUTH_CUSTOM_CLIENT_ID,
      clientSecret: env.AUTH_CUSTOM_CLIENT_SECRET,
      issuer: env.AUTH_CUSTOM_ISSUER,
      allowDangerousEmailAccountLinking:
        env.AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING === "true",
    }),
  );

if (env.AUTH_GOOGLE_CLIENT_ID && env.AUTH_GOOGLE_CLIENT_SECRET)
  staticProviders.push(
    GoogleProvider({
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking:
        env.AUTH_GOOGLE_ALLOW_ACCOUNT_LINKING === "true",
    }),
  );

if (
  env.AUTH_OKTA_CLIENT_ID &&
  env.AUTH_OKTA_CLIENT_SECRET &&
  env.AUTH_OKTA_ISSUER
)
  staticProviders.push(
    OktaProvider({
      clientId: env.AUTH_OKTA_CLIENT_ID,
      clientSecret: env.AUTH_OKTA_CLIENT_SECRET,
      issuer: env.AUTH_OKTA_ISSUER,
      allowDangerousEmailAccountLinking:
        env.AUTH_OKTA_ALLOW_ACCOUNT_LINKING === "true",
    }),
  );

if (
  env.AUTH_AUTH0_CLIENT_ID &&
  env.AUTH_AUTH0_CLIENT_SECRET &&
  env.AUTH_AUTH0_ISSUER
)
  staticProviders.push(
    Auth0Provider({
      clientId: env.AUTH_AUTH0_CLIENT_ID,
      clientSecret: env.AUTH_AUTH0_CLIENT_SECRET,
      issuer: env.AUTH_AUTH0_ISSUER,
      allowDangerousEmailAccountLinking:
        env.AUTH_AUTH0_ALLOW_ACCOUNT_LINKING === "true",
    }),
  );

if (env.AUTH_GITHUB_CLIENT_ID && env.AUTH_GITHUB_CLIENT_SECRET)
  staticProviders.push(
    GitHubProvider({
      clientId: env.AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking:
        env.AUTH_GITHUB_ALLOW_ACCOUNT_LINKING === "true",
    }),
  );

if (
  env.AUTH_AZURE_AD_CLIENT_ID &&
  env.AUTH_AZURE_AD_CLIENT_SECRET &&
  env.AUTH_AZURE_AD_TENANT_ID
)
  staticProviders.push(
    AzureADProvider({
      clientId: env.AUTH_AZURE_AD_CLIENT_ID,
      clientSecret: env.AUTH_AZURE_AD_CLIENT_SECRET,
      tenantId: env.AUTH_AZURE_AD_TENANT_ID,
      allowDangerousEmailAccountLinking:
        env.AUTH_AZURE_ALLOW_ACCOUNT_LINKING === "true",
    }),
  );

if (
  env.AUTH_COGNITO_CLIENT_ID &&
  env.AUTH_COGNITO_CLIENT_SECRET &&
  env.AUTH_COGNITO_ISSUER
)
  staticProviders.push(
    CognitoProvider({
      clientId: env.AUTH_COGNITO_CLIENT_ID,
      clientSecret: env.AUTH_COGNITO_CLIENT_SECRET,
      issuer: env.AUTH_COGNITO_ISSUER,
      allowDangerousEmailAccountLinking:
        env.AUTH_COGNITO_ALLOW_ACCOUNT_LINKING === "true",
    }),
  );

// Extend Prisma Adapter
const prismaAdapter = PrismaAdapter(prisma);
const extendedPrismaAdapter: Adapter = {
  ...prismaAdapter,
  async createUser(profile) {
    if (!prismaAdapter.createUser)
      throw new Error("createUser not implemented");
    if (
      env.NEXT_PUBLIC_SIGN_UP_DISABLED === "true" ||
      env.AUTH_DISABLE_SIGNUP === "true"
    ) {
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
export async function getAuthOptions(): Promise<NextAuthOptions> {
  let dynamicSsoProviders: Provider[] = [];
  try {
    dynamicSsoProviders = await loadSsoProviders();
  } catch (e) {
    console.error("Error loading dynamic SSO providers", e);
    Sentry.captureException(e);
  }
  const providers = [...staticProviders, ...dynamicSsoProviders];

  const data: NextAuthOptions = {
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
            emailVerified: true,
            featureFlags: true,
            admin: true,
            projectMemberships: {
              include: {
                project: true,
              },
            },
          },
        });

        return {
          ...session,
          environment: {
            enableExperimentalFeatures:
              env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES === "true",
            disableExpensivePostgresQueries:
              env.LANGFUSE_DISABLE_EXPENSIVE_POSTGRES_QUERIES === "true",
            defaultTableDateTimeOffset:
              env.LANGFUSE_DEFAULT_TABLE_DATETIME_OFFSET,
            // Enables features that are only available under an enterprise license when self-hosting Langfuse
            // If you edit this line, you risk executing code that is not MIT licensed (self-contained in /ee folders otherwise)
            eeEnabled: env.LANGFUSE_EE_LICENSE_KEY !== undefined,
          },
          user:
            dbUser !== null
              ? {
                  ...session.user,
                  id: dbUser.id,
                  name: dbUser.name,
                  email: dbUser.email,
                  image: dbUser.image,
                  admin: dbUser.admin,
                  emailVerified: dbUser.emailVerified?.toISOString(),
                  projects: dbUser.projectMemberships.map((membership) => ({
                    id: membership.project.id,
                    name: membership.project.name,
                    role: membership.role,
                    cloudConfig: {
                      defaultLookBackDays:
                        cloudConfigSchema
                          .nullish()
                          .parse(membership.project.cloudConfig)
                          ?.defaultLookBackDays ?? null,
                    },
                  })),
                  featureFlags: parseFlags(dbUser.featureFlags),
                }
              : null,
        };
      },
      async signIn({ user, account, profile }) {
        // Block sign in without valid user.email
        const email = user.email?.toLowerCase();
        if (!email) {
          throw new Error("No email found in user object");
        }
        if (z.string().email().safeParse(email).success === false) {
          throw new Error("Invalid email found in user object");
        }

        // EE: Check custom SSO enforcement, enforce the specific SSO provider on email domain
        // This also blocks setting a password for an email that is enforced to use SSO via password reset flow
        const domain = email.split("@")[1];
        const customSsoProvider = await getSsoAuthProviderIdForDomain(domain);
        if (customSsoProvider && account?.provider !== customSsoProvider) {
          throw new Error(`You must sign in via SSO for this domain.`);
        }

        // Only allow sign in via email link if user is already in db as this is used for password reset
        if (account?.provider === "email") {
          const user = await prisma.user.findUnique({
            where: {
              email: email,
            },
          });
          if (user) {
            return true;
          } else {
            // Add random delay to prevent leaking if user exists as otherwise it would be instant compared to sending an email
            await new Promise((resolve) =>
              setTimeout(resolve, Math.random() * 2000 + 200),
            );
            // Prevents sign in with email link if user does not exist
            return false;
          }
        }

        // Optional configuration: validate authorised email domains for google provider
        // uses hd (hosted domain) claim from google profile as the domain
        // https://developers.google.com/identity/openid-connect/openid-connect#an-id-tokens-payload
        if (env.AUTH_GOOGLE_ALLOWED_DOMAINS && account?.provider === "google") {
          const allowedDomains =
            env.AUTH_GOOGLE_ALLOWED_DOMAINS?.split(",").map((domain) =>
              domain.trim().toLowerCase(),
            ) ?? [];
          if (allowedDomains.length > 0) {
            return await Promise.resolve(
              allowedDomains.includes(
                (profile as GoogleProfile).hd.toLowerCase(),
              ),
            );
          }
        }

        return await Promise.resolve(true);
      },
    },
    adapter: extendedPrismaAdapter,
    providers,
    pages: {
      signIn: "/auth/sign-in",
      error: "/auth/error",
      ...(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
        ? {
            newUser: "/onboarding",
          }
        : {}),
    },
    cookies: {
      sessionToken: {
        name: getCookieName("next-auth.session-token"),
        options: getCookieOptions(),
      },
      csrfToken: {
        name: getCookieName("next-auth.csrf-token"),
        options: getCookieOptions(),
      },
      callbackUrl: {
        name: getCookieName("next-auth.callback-url"),
        options: getCookieOptions(),
      },
      state: {
        name: getCookieName("next-auth.state"),
        options: getCookieOptions(),
      },
      nonce: {
        name: getCookieName("next-auth.nonce"),
        options: getCookieOptions(),
      },
      pkceCodeVerifier: {
        name: getCookieName("next-auth.pkce.code_verifier"),
        options: getCookieOptions(),
      },
    },
    events: {
      createUser: async ({ user }) => {
        if (
          env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK &&
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "STAGING" &&
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "DEV"
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
  return data;
}

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = async (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  const authOptions = await getAuthOptions();
  // https://github.com/nextauthjs/next-auth/issues/2408#issuecomment-1382629234
  // for api routes, we need to call the headers in the api route itself
  // disable caching for anything auth related
  ctx.res.setHeader("Cache-Control", "no-store, max-age=0");
  return getServerSession(ctx.req, ctx.res, authOptions);
};
