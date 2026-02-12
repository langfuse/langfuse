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
import {
  type AdapterUser,
  type Adapter,
  type AdapterAccount,
} from "next-auth/adapters";

// Providers
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import GitLabProvider from "next-auth/providers/gitlab";
import OktaProvider from "next-auth/providers/okta";
import AuthentikProvider from "next-auth/providers/authentik";
import OneLoginProvider from "next-auth/providers/onelogin";
import EmailProvider from "next-auth/providers/email";
import { randomInt } from "crypto";
import Auth0Provider from "next-auth/providers/auth0";
import CognitoProvider from "next-auth/providers/cognito";
import AzureADProvider from "next-auth/providers/azure-ad";
import KeycloakProvider from "next-auth/providers/keycloak";
import WorkOSProvider from "next-auth/providers/workos";
import WordPressProvider from "next-auth/providers/wordpress";
import { type Provider } from "next-auth/providers/index";
import { getCookieName, getCookieOptions } from "./utils/cookies";
import {
  findMultiTenantSsoConfig,
  getSsoAuthProviderIdForDomain,
  loadSsoProviders,
} from "@/src/ee/features/multi-tenant-sso/utils";
import { ENTERPRISE_SSO_REQUIRED_MESSAGE } from "@/src/features/auth/constants";
import { z } from "zod/v4";
import { CloudConfigSchema } from "@langfuse/shared";
import {
  CustomSSOProvider,
  GitHubEnterpriseProvider,
  JumpCloudProvider,
  traceException,
  sendResetPasswordVerificationRequest,
  instrumentAsync,
  logger,
  resolveProjectRole,
} from "@langfuse/shared/src/server";
import {
  getOrganizationPlanServerSide,
  getSelfHostedInstancePlanServerSide,
} from "@/src/features/entitlements/server/getPlan";
import { projectRoleAccessRights } from "@/src/features/rbac/constants/projectAccessRights";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { getSSOBlockedDomains } from "@/src/features/auth-credentials/server/signupApiHandler";
import { createSupportEmailHash } from "@/src/features/support-chat/createSupportEmailHash";

function canCreateOrganizations(userEmail: string | null): boolean {
  const instancePlan = getSelfHostedInstancePlanServerSide();

  // if no allowlist is set or no entitlement for self-host-allowed-organization-creators, allow all users to create organizations
  if (
    !env.LANGFUSE_ALLOWED_ORGANIZATION_CREATORS ||
    !hasEntitlementBasedOnPlan({
      plan: instancePlan,
      entitlement: "self-host-allowed-organization-creators",
    })
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
    },
    async authorize(credentials, _req) {
      if (!credentials) throw new Error("No credentials");
      if (env.AUTH_DISABLE_USERNAME_PASSWORD === "true")
        throw new Error(
          "Sign in with email and password is disabled for this instance. Please use SSO.",
        );

      const blockedDomains = getSSOBlockedDomains();
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
        throw new Error(ENTERPRISE_SSO_REQUIRED_MESSAGE);
      }

      const dbUser = await prisma.user.findUnique({
        where: {
          email: credentials.email.toLowerCase(),
        },
      });

      if (!dbUser) throw new Error("Invalid credentials");
      if (dbUser.password === null)
        throw new Error(
          "Please sign in with the identity provider (e.g. Google, GitHub, Azure AD, etc.) that is linked to your account.",
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
      maxAge: 3 * 60, // 3 minutes
      async generateVerificationToken() {
        return randomInt(100000, 1000000).toString();
      },
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
      idToken: env.AUTH_CUSTOM_ID_TOKEN === "true",
      allowDangerousEmailAccountLinking:
        env.AUTH_CUSTOM_ALLOW_ACCOUNT_LINKING === "true",
      authorization: {
        params: { scope: env.AUTH_CUSTOM_SCOPE ?? "openid email profile" },
      },
      client: {
        token_endpoint_auth_method: env.AUTH_CUSTOM_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_CUSTOM_CHECKS ? { checks: env.AUTH_CUSTOM_CHECKS } : {}),
    }),
  );

if (env.AUTH_GOOGLE_CLIENT_ID && env.AUTH_GOOGLE_CLIENT_SECRET)
  staticProviders.push(
    GoogleProvider({
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking:
        env.AUTH_GOOGLE_ALLOW_ACCOUNT_LINKING === "true",
      client: {
        token_endpoint_auth_method: env.AUTH_GOOGLE_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_GOOGLE_CHECKS ? { checks: env.AUTH_GOOGLE_CHECKS } : {}),
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
      client: {
        token_endpoint_auth_method: env.AUTH_OKTA_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_OKTA_CHECKS ? { checks: env.AUTH_OKTA_CHECKS } : {}),
    }),
  );

if (
  env.AUTH_AUTHENTIK_CLIENT_ID &&
  env.AUTH_AUTHENTIK_CLIENT_SECRET &&
  env.AUTH_AUTHENTIK_ISSUER
)
  staticProviders.push(
    AuthentikProvider({
      clientId: env.AUTH_AUTHENTIK_CLIENT_ID,
      clientSecret: env.AUTH_AUTHENTIK_CLIENT_SECRET,
      issuer: env.AUTH_AUTHENTIK_ISSUER,
      allowDangerousEmailAccountLinking:
        env.AUTH_AUTHENTIK_ALLOW_ACCOUNT_LINKING === "true",
      client: {
        token_endpoint_auth_method: env.AUTH_AUTHENTIK_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_AUTHENTIK_CHECKS
        ? { checks: env.AUTH_AUTHENTIK_CHECKS }
        : {}),
    }),
  );

if (
  env.AUTH_ONELOGIN_CLIENT_ID &&
  env.AUTH_ONELOGIN_CLIENT_SECRET &&
  env.AUTH_ONELOGIN_ISSUER
)
  staticProviders.push(
    OneLoginProvider({
      clientId: env.AUTH_ONELOGIN_CLIENT_ID,
      clientSecret: env.AUTH_ONELOGIN_CLIENT_SECRET,
      issuer: env.AUTH_ONELOGIN_ISSUER,
      allowDangerousEmailAccountLinking:
        env.AUTH_ONELOGIN_ALLOW_ACCOUNT_LINKING === "true",
      client: {
        token_endpoint_auth_method: env.AUTH_ONELOGIN_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_ONELOGIN_CHECKS ? { checks: env.AUTH_ONELOGIN_CHECKS } : {}),
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
      client: {
        token_endpoint_auth_method: env.AUTH_AUTH0_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_AUTH0_CHECKS ? { checks: env.AUTH_AUTH0_CHECKS } : {}),
    }),
  );

if (env.AUTH_GITHUB_CLIENT_ID && env.AUTH_GITHUB_CLIENT_SECRET)
  staticProviders.push(
    GitHubProvider({
      clientId: env.AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking:
        env.AUTH_GITHUB_ALLOW_ACCOUNT_LINKING === "true",
      client: {
        token_endpoint_auth_method: env.AUTH_GITHUB_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_GITHUB_CHECKS ? { checks: env.AUTH_GITHUB_CHECKS } : {}),
    }),
  );

if (
  env.AUTH_GITHUB_ENTERPRISE_CLIENT_ID &&
  env.AUTH_GITHUB_ENTERPRISE_CLIENT_SECRET &&
  env.AUTH_GITHUB_ENTERPRISE_BASE_URL
) {
  staticProviders.push(
    GitHubEnterpriseProvider({
      clientId: env.AUTH_GITHUB_ENTERPRISE_CLIENT_ID,
      clientSecret: env.AUTH_GITHUB_ENTERPRISE_CLIENT_SECRET,
      enterprise: { baseUrl: env.AUTH_GITHUB_ENTERPRISE_BASE_URL },
      allowDangerousEmailAccountLinking:
        env.AUTH_GITHUB_ENTERPRISE_ALLOW_ACCOUNT_LINKING === "true",
      client: {
        token_endpoint_auth_method:
          env.AUTH_GITHUB_ENTERPRISE_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_GITHUB_ENTERPRISE_CHECKS
        ? { checks: env.AUTH_GITHUB_ENTERPRISE_CHECKS }
        : {}),
    }),
  );
}

if (env.AUTH_GITLAB_CLIENT_ID && env.AUTH_GITLAB_CLIENT_SECRET)
  staticProviders.push(
    GitLabProvider({
      clientId: env.AUTH_GITLAB_CLIENT_ID,
      clientSecret: env.AUTH_GITLAB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking:
        env.AUTH_GITLAB_ALLOW_ACCOUNT_LINKING === "true",
      issuer: env.AUTH_GITLAB_ISSUER,
      client: {
        token_endpoint_auth_method: env.AUTH_GITLAB_CLIENT_AUTH_METHOD,
      },
      authorization: {
        url: `${env.AUTH_GITLAB_URL}/oauth/authorize`,
        params: { scope: "read_user" },
      },
      token: `${env.AUTH_GITLAB_URL}/oauth/token`,
      userinfo: `${env.AUTH_GITLAB_URL}/api/v4/user`,
      ...(env.AUTH_GITLAB_CHECKS ? { checks: env.AUTH_GITLAB_CHECKS } : {}),
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
        env.AUTH_AZURE_AD_ALLOW_ACCOUNT_LINKING === "true",
      client: {
        token_endpoint_auth_method: env.AUTH_AZURE_AD_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_AZURE_AD_CHECKS ? { checks: env.AUTH_AZURE_AD_CHECKS } : {}),
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
      client: {
        token_endpoint_auth_method: env.AUTH_COGNITO_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_COGNITO_CHECKS
        ? { checks: env.AUTH_COGNITO_CHECKS }
        : { checks: "nonce" }),
    }),
  );

if (
  env.AUTH_KEYCLOAK_CLIENT_ID &&
  env.AUTH_KEYCLOAK_CLIENT_SECRET &&
  env.AUTH_KEYCLOAK_ISSUER
)
  staticProviders.push(
    KeycloakProvider({
      clientId: env.AUTH_KEYCLOAK_CLIENT_ID,
      clientSecret: env.AUTH_KEYCLOAK_CLIENT_SECRET,
      issuer: env.AUTH_KEYCLOAK_ISSUER,
      idToken: env.AUTH_KEYCLOAK_ID_TOKEN === "true",
      allowDangerousEmailAccountLinking:
        env.AUTH_KEYCLOAK_ALLOW_ACCOUNT_LINKING === "true",
      authorization: {
        params: { scope: env.AUTH_KEYCLOAK_SCOPE ?? "openid email profile" },
      },
      client: {
        token_endpoint_auth_method: env.AUTH_KEYCLOAK_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_KEYCLOAK_CHECKS ? { checks: env.AUTH_KEYCLOAK_CHECKS } : {}),
    }),
  );

if (
  env.AUTH_JUMPCLOUD_CLIENT_ID &&
  env.AUTH_JUMPCLOUD_CLIENT_SECRET &&
  env.AUTH_JUMPCLOUD_ISSUER
)
  staticProviders.push(
    JumpCloudProvider({
      clientId: env.AUTH_JUMPCLOUD_CLIENT_ID,
      clientSecret: env.AUTH_JUMPCLOUD_CLIENT_SECRET,
      issuer: env.AUTH_JUMPCLOUD_ISSUER,
      allowDangerousEmailAccountLinking:
        env.AUTH_JUMPCLOUD_ALLOW_ACCOUNT_LINKING === "true",
      authorization: {
        params: { scope: env.AUTH_JUMPCLOUD_SCOPE ?? "openid profile email" },
      },
      client: {
        token_endpoint_auth_method: env.AUTH_JUMPCLOUD_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_JUMPCLOUD_CHECKS
        ? { checks: env.AUTH_JUMPCLOUD_CHECKS }
        : {}),
    }),
  );

if (env.AUTH_WORKOS_CLIENT_ID && env.AUTH_WORKOS_CLIENT_SECRET)
  staticProviders.push(
    WorkOSProvider({
      clientId: env.AUTH_WORKOS_CLIENT_ID,
      clientSecret: env.AUTH_WORKOS_CLIENT_SECRET,
      allowDangerousEmailAccountLinking:
        env.AUTH_WORKOS_ALLOW_ACCOUNT_LINKING === "true",
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
    }),
  );

if (env.AUTH_WORDPRESS_CLIENT_ID && env.AUTH_WORDPRESS_CLIENT_SECRET)
  staticProviders.push(
    WordPressProvider({
      clientId: env.AUTH_WORDPRESS_CLIENT_ID,
      clientSecret: env.AUTH_WORDPRESS_CLIENT_SECRET,
      allowDangerousEmailAccountLinking:
        env.AUTH_WORDPRESS_ALLOW_ACCOUNT_LINKING === "true",
      client: {
        token_endpoint_auth_method: env.AUTH_WORDPRESS_CLIENT_AUTH_METHOD,
      },
      ...(env.AUTH_WORDPRESS_CHECKS
        ? { checks: env.AUTH_WORDPRESS_CHECKS }
        : {}),
    }),
  );

// Extend Prisma Adapter
const prismaAdapter = PrismaAdapter(prisma);
const ignoredAccountFields = env.AUTH_IGNORE_ACCOUNT_FIELDS?.split(",") ?? [];
const extendedPrismaAdapter: Adapter = {
  ...prismaAdapter,
  async createUser(profile: Omit<AdapterUser, "id">) {
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

  async linkAccount(data: AdapterAccount) {
    if (!prismaAdapter.linkAccount)
      throw new Error("NextAuth: prismaAdapter.linkAccount not implemented");

    // Keycloak returns incompatible data with the nextjs-auth schema
    // (refresh_expires_in and not-before-policy in).
    // So, we need to remove this data from the payload before linking an account.
    // https://github.com/nextauthjs/next-auth/issues/7655
    if (data.provider.endsWith("keycloak")) {
      // endsWith required as the multi-tenant cloud SSO providers are in the "domain.provider" format
      delete data["refresh_expires_in"];
      delete data["not-before-policy"];
    }

    // WorkOS returns profile data that doesn't match the schema
    if (data.provider.endsWith("workos")) {
      // endsWith required as the multi-tenant cloud SSO providers are in the "domain.provider" format
      delete data["profile"];
    }

    // Optionally, remove fields returned by the provider that cause issues with the adapter
    // Configure via AUTH_IGNORE_ACCOUNT_FIELDS
    for (const ignoredField of ignoredAccountFields) {
      if (ignoredField in data) {
        delete data[ignoredField];
      }
    }

    await prismaAdapter.linkAccount(data);

    // Assign default memberships for existing users logging in via SSO
    // This is idempotent - won't duplicate or overwrite existing memberships
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, email: true },
    });
    if (user) {
      await createProjectMembershipsOnSignup(user);
    }
  },

  // Make email-OTP login that is used for password reset safer
  async useVerificationToken(params) {
    if (!prismaAdapter.useVerificationToken)
      throw new Error("useVerificationToken not implemented");

    try {
      // First, attempt to use the token with the default behavior
      const result = await prismaAdapter.useVerificationToken(params);

      if (result) {
        // Token was valid and successfully used
        logger.info("OTP verification successful", {
          identifier: params.identifier,
          timestamp: new Date().toISOString(),
        });
        return result;
      }

      // If no result, the token was either invalid or expired
      // Log security event for monitoring
      logger.info("Failed OTP verification attempt", {
        identifier: params.identifier,
        token: params.token?.substring(0, 2) + "****", // Log partial token for debugging
        timestamp: new Date().toISOString(),
        reason: "invalid_or_expired",
      });

      // Delete any existing token for this identifier to prevent enumeration
      await prisma.verificationToken.deleteMany({
        where: {
          identifier: params.identifier,
        },
      });

      return null;
    } catch (error) {
      // Log security event for any error during token verification
      logger.error("OTP verification error", {
        identifier: params.identifier,
        token: params.token?.substring(0, 2) + "****",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });

      // On any error (invalid token, etc.), delete all tokens for this identifier
      // to prevent enumeration attacks
      try {
        await prisma.verificationToken.deleteMany({
          where: {
            identifier: params.identifier,
          },
        });
      } catch (deleteError) {
        // Log deletion error but don't throw to avoid masking original error
        logger.error(
          "Failed to delete verification tokens on error",
          deleteError,
        );
      }

      // Re-throw the original error
      throw error;
    }
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
        return instrumentAsync({ name: "next-auth-session" }, async (span) => {
          const dbUser = await prisma.user.findUnique({
            where: {
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
              v4BetaEnabled: true,
              organizationMemberships: {
                include: {
                  organization: {
                    include: {
                      projects: {
                        where: {
                          deletedAt: {
                            equals: null,
                          },
                        },
                      },
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

          span.setAttribute("langfuse.user.email", dbUser?.email ?? "");
          span.setAttribute("langfuse.user.id", dbUser?.id ?? "");

          return {
            ...session,
            environment: {
              enableExperimentalFeatures:
                env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES === "true",
              // Enables features that are only available under an enterprise license when self-hosting Langfuse
              // If you edit this line, you risk executing code that is not MIT licensed (self-contained in /ee folders otherwise)
              selfHostedInstancePlan: getSelfHostedInstancePlanServerSide(),
            },
            user:
              dbUser !== null
                ? {
                    ...session.user,
                    id: dbUser.id,
                    name: dbUser.name,
                    email: dbUser.email,
                    emailSupportHash: dbUser.email
                      ? createSupportEmailHash(dbUser.email)
                      : undefined,
                    image: dbUser.image,
                    admin: dbUser.admin,
                    v4BetaEnabled: dbUser.v4BetaEnabled,
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
                          metadata:
                            (orgMembership.organization.metadata as Record<
                              string,
                              unknown
                            >) ?? {},
                          aiFeaturesEnabled:
                            orgMembership.organization.aiFeaturesEnabled,
                          cloudConfig: parsedCloudConfig.data,
                          projects: orgMembership.organization.projects
                            .map((project) => {
                              const projectRole = resolveProjectRole({
                                projectId: project.id,
                                projectMemberships:
                                  orgMembership.ProjectMemberships,
                                orgMembershipRole: orgMembership.role,
                              });
                              return {
                                id: project.id,
                                name: project.name,
                                role: projectRole,
                                retentionDays: project.retentionDays,
                                hasTraces: project.hasTraces,
                                deletedAt: project.deletedAt,
                                metadata:
                                  (project.metadata as Record<
                                    string,
                                    unknown
                                  >) ?? {},
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
                          plan: getOrganizationPlanServerSide(
                            parsedCloudConfig.data,
                          ),
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
        return instrumentAsync({ name: "next-auth-sign-in" }, async (span) => {
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

          span.setAttributes({
            "auth.email": email,
          });
          // EE: Check custom SSO enforcement, enforce the specific SSO provider on email domain
          // This also blocks setting a password for an email that is enforced to use SSO via password reset flow
          const userDomain = email.split("@")[1].toLowerCase();
          const multiTenantSsoProvider =
            await getSsoAuthProviderIdForDomain(userDomain);
          if (
            multiTenantSsoProvider &&
            account?.provider !== multiTenantSsoProvider
          ) {
            logger.info(
              "Custom SSO provider enforced for domain, user signed in with other provider",
              { email, attemptedProvider: account?.provider },
            );
            const params = new URLSearchParams({
              reason: "sso_enforced_domain",
            });
            if (email) params.set("email", email);
            if (account?.provider)
              params.set("attemptedProvider", account.provider);
            return `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/enterprise-sso-required?${params.toString()}`;
          }

          // EE: Check that provider is only used for the associated domain
          if (account?.provider) {
            const { isMultiTenantSsoProvider, domain: ssoDomain } =
              await findMultiTenantSsoConfig({
                providerId: account.provider,
              });
            if (
              isMultiTenantSsoProvider &&
              ssoDomain.toLowerCase() !== userDomain.toLowerCase()
            ) {
              throw new Error(
                `This domain is not associated with this SSO provider.`,
              );
            }
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
