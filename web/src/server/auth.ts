import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type User,
  type NextAuthOptions,
  type Session,
} from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma, type Role } from "@langfuse/shared/src/db";
import { verifyPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { parseFlags } from "@/src/features/feature-flags/utils";
import { env } from "@/src/env.mjs";
import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { type Adapter } from "next-auth/adapters";

// Providers
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import GitLabProvider from "next-auth/providers/gitlab";
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
} from "@/src/ee/features/multi-tenant-sso/utils";
import { z } from "zod";
import { CloudConfigSchema } from "@langfuse/shared";
import {
  CustomSSOProvider,
  traceException,
  sendResetPasswordVerificationRequest,
  instrumentAsync,
  logger,
} from "@langfuse/shared/src/server";
import { getOrganizationPlan } from "@/src/features/entitlements/server/getOrganizationPlan";
import { projectRoleAccessRights } from "@/src/features/rbac/constants/projectAccessRights";

function canCreateOrganizations(userEmail: string | null): boolean {
  // if no allowlist is set or no active EE key, allow all users to create organizations
  if (
    !env.LANGFUSE_ALLOWED_ORGANIZATION_CREATORS ||
    !env.LANGFUSE_EE_LICENSE_KEY
  )
    return true;

  if (!userEmail) return false;

  const allowedOrgCreators =
    env.LANGFUSE_ALLOWED_ORGANIZATION_CREATORS.toLowerCase().split(",");
  return allowedOrgCreators.includes(userEmail.toLowerCase());
}

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
      const multiTenantSsoProvider =
        await getSsoAuthProviderIdForDomain(domain);
      if (multiTenantSsoProvider) {
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
        canCreateOrganizations: canCreateOrganizations(dbUser.email),
        organizations: [],
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
      maxAge: 60 * 10, // 10 minutes
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
      authorization: {
        params: { scope: env.AUTH_CUSTOM_SCOPE ?? "openid email profile" },
      },
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

if (env.AUTH_GITLAB_CLIENT_ID && env.AUTH_GITLAB_CLIENT_SECRET)
  staticProviders.push(
    GitLabProvider({
      clientId: env.AUTH_GITLAB_CLIENT_ID,
      clientSecret: env.AUTH_GITLAB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking:
        env.AUTH_GITLAB_ALLOW_ACCOUNT_LINKING === "true",
    })
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
    logger.error("Error loading dynamic SSO providers", e);
    traceException(e);
  }
  const providers = [...staticProviders, ...dynamicSsoProviders];

  const data: NextAuthOptions = {
    session: {
      strategy: "jwt",
      maxAge: env.AUTH_SESSION_MAX_AGE * 60, // convert minutes to seconds, default is set in env.mjs
    },
    callbacks: {
      async session({ session, token }): Promise<Session> {
        return instrumentAsync({ name: "next-auth-session" }, async () => {
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
              organizationMemberships: {
                include: {
                  organization: {
                    include: {
                      projects: true,
                    },
                  },
                  ProjectMemberships: {
                    include: {
                      project: true,
                    },
                  },
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
                    canCreateOrganizations: canCreateOrganizations(
                      dbUser.email,
                    ),
                    organizations: dbUser.organizationMemberships.map(
                      (orgMembership) => {
                        const parsedCloudConfig = CloudConfigSchema.safeParse(
                          orgMembership.organization.cloudConfig,
                        );
                        return {
                          id: orgMembership.organization.id,
                          name: orgMembership.organization.name,
                          role: orgMembership.role,
                          cloudConfig: parsedCloudConfig.data,
                          projects: orgMembership.organization.projects
                            .map((project) => {
                              const projectRole: Role =
                                orgMembership.ProjectMemberships.find(
                                  (membership) =>
                                    membership.projectId === project.id,
                                )?.role ?? orgMembership.role;
                              return {
                                id: project.id,
                                name: project.name,
                                role: projectRole,
                              };
                            })
                            // Only include projects where the user has the required role
                            .filter((project) =>
                              projectRoleAccessRights[project.role].includes(
                                "project:read",
                              ),
                            ),

                          // Enables features/entitlements based on the plan of the organization, either cloud or EE version when self-hosting
                          // If you edit this line, you risk executing code that is not MIT licensed (contained in /ee folders, see LICENSE)
                          plan: getOrganizationPlan(parsedCloudConfig.data),
                        };
                      },
                    ),
                    emailVerified: dbUser.emailVerified?.toISOString(),
                    featureFlags: parseFlags(dbUser.featureFlags),
                  }
                : null,
          };
        });
      },
      async signIn({ user, account, profile }) {
        return instrumentAsync({ name: "next-auth-sign-in" }, async () => {
          // Block sign in without valid user.email
          const email = user.email?.toLowerCase();
          if (!email) {
            logger.error("No email found in user object");
            throw new Error("No email found in user object");
          }
          if (z.string().email().safeParse(email).success === false) {
            logger.error("Invalid email found in user object");
            throw new Error("Invalid email found in user object");
          }

          // EE: Check custom SSO enforcement, enforce the specific SSO provider on email domain
          // This also blocks setting a password for an email that is enforced to use SSO via password reset flow
          const domain = email.split("@")[1];
          const multiTenantSsoProvider =
            await getSsoAuthProviderIdForDomain(domain);
          if (
            multiTenantSsoProvider &&
            account?.provider !== multiTenantSsoProvider
          ) {
            console.log(
              "Custom SSO provider enforced for domain, user signed in with other provider",
            );
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
          if (
            env.AUTH_GOOGLE_ALLOWED_DOMAINS &&
            account?.provider === "google"
          ) {
            const allowedDomains =
              env.AUTH_GOOGLE_ALLOWED_DOMAINS?.split(",").map((domain) =>
                domain.trim().toLowerCase(),
              ) ?? [];

            if (allowedDomains.length > 0) {
              return await Promise.resolve(
                allowedDomains.includes(
                  (profile as GoogleProfile).hd?.toLowerCase(),
                ),
              );
            }
          }

          return await Promise.resolve(true);
        });
      },
    },
    adapter: extendedPrismaAdapter,
    providers,
    pages: {
      signIn: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/sign-in`,
      error: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/error`,
      ...(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
        ? {
            newUser: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/onboarding`,
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

  // disable caching for any api requiring server-side auth
  ctx.res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  ctx.res.setHeader("Pragma", "no-cache");
  ctx.res.setHeader("Expires", "0");

  return getServerSession(ctx.req, ctx.res, authOptions);
};
