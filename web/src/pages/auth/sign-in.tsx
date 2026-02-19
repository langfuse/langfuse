import { type GetServerSideProps } from "next";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { env } from "@/src/env.mjs";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  SiOkta,
  SiAuthentik,
  SiAuth0,
  SiClickhouse,
  SiAmazoncognito,
  SiKeycloak,
  SiGoogle,
  SiGitlab,
  SiGithub,
  SiWordpress,
} from "react-icons/si";
import { TbBrandAzure, TbBrandOauth } from "react-icons/tb";
import { signIn } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/v4";
import { CloudPrivacyNotice } from "@/src/features/auth/components/AuthCloudPrivacyNotice";
import { CloudRegionSwitch } from "@/src/features/auth/components/AuthCloudRegionSwitch";
import { PasswordInput } from "@/src/components/ui/password-input";
import { isAnySsoConfigured } from "@/src/ee/features/multi-tenant-sso/utils";
import { Code, Key } from "lucide-react";
import { useRouter } from "next/router";
import { captureException } from "@sentry/nextjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useLocalStorage from "@/src/components/useLocalStorage";
import { AuthProviderButton } from "@/src/features/auth/components/AuthProviderButton";
import { cn } from "@/src/utils/tailwind";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { getSafeRedirectPath } from "@/src/utils/redirect";

const credentialAuthForm = z.object({
  email: z.string().email(),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters long",
  }),
});

// Also used in src/pages/auth/sign-up.tsx
export type PageProps = {
  authProviders: {
    credentials: boolean;
    google: boolean;
    github: boolean;
    githubEnterprise: boolean;
    gitlab: boolean;
    okta: boolean;
    authentik: boolean;
    onelogin: boolean;
    azureAd: boolean;
    auth0: boolean;
    clickhouseCloud: boolean;
    cognito: boolean;
    keycloak:
      | {
          name: string;
        }
      | boolean;
    workos:
      | {
          organizationId: string;
        }
      | {
          connectionId: string;
        }
      | boolean;
    wordpress: boolean;
    custom:
      | {
          name: string;
        }
      | false;
    sso: boolean;
  };
  runningOnHuggingFaceSpaces: boolean;
  signUpDisabled: boolean;
};

// Also used in src/pages/auth/sign-up.tsx

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const sso: boolean = await isAnySsoConfigured();
  return {
    props: {
      authProviders: {
        google:
          env.AUTH_GOOGLE_CLIENT_ID !== undefined &&
          env.AUTH_GOOGLE_CLIENT_SECRET !== undefined,
        github:
          env.AUTH_GITHUB_CLIENT_ID !== undefined &&
          env.AUTH_GITHUB_CLIENT_SECRET !== undefined,
        githubEnterprise:
          env.AUTH_GITHUB_ENTERPRISE_CLIENT_ID !== undefined &&
          env.AUTH_GITHUB_ENTERPRISE_CLIENT_SECRET !== undefined &&
          env.AUTH_GITHUB_ENTERPRISE_BASE_URL !== undefined,
        gitlab:
          env.AUTH_GITLAB_CLIENT_ID !== undefined &&
          env.AUTH_GITLAB_CLIENT_SECRET !== undefined,
        okta:
          env.AUTH_OKTA_CLIENT_ID !== undefined &&
          env.AUTH_OKTA_CLIENT_SECRET !== undefined &&
          env.AUTH_OKTA_ISSUER !== undefined,
        authentik:
          env.AUTH_AUTHENTIK_CLIENT_ID !== undefined &&
          env.AUTH_AUTHENTIK_CLIENT_SECRET !== undefined &&
          env.AUTH_AUTHENTIK_ISSUER !== undefined,
        onelogin:
          env.AUTH_ONELOGIN_CLIENT_ID !== undefined &&
          env.AUTH_ONELOGIN_CLIENT_SECRET !== undefined &&
          env.AUTH_ONELOGIN_ISSUER !== undefined,
        credentials: env.AUTH_DISABLE_USERNAME_PASSWORD !== "true",
        azureAd:
          env.AUTH_AZURE_AD_CLIENT_ID !== undefined &&
          env.AUTH_AZURE_AD_CLIENT_SECRET !== undefined &&
          env.AUTH_AZURE_AD_TENANT_ID !== undefined,
        auth0:
          env.AUTH_AUTH0_CLIENT_ID !== undefined &&
          env.AUTH_AUTH0_CLIENT_SECRET !== undefined &&
          env.AUTH_AUTH0_ISSUER !== undefined,
        // Langfuse Cloud only — NOT for self-hosted Langfuse
        clickhouseCloud:
          env.AUTH_CLICKHOUSE_CLOUD_CLIENT_ID !== undefined &&
          env.AUTH_CLICKHOUSE_CLOUD_CLIENT_SECRET !== undefined &&
          env.AUTH_CLICKHOUSE_CLOUD_ISSUER !== undefined &&
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined,
        cognito:
          env.AUTH_COGNITO_CLIENT_ID !== undefined &&
          env.AUTH_COGNITO_CLIENT_SECRET !== undefined &&
          env.AUTH_COGNITO_ISSUER !== undefined,
        keycloak:
          env.AUTH_KEYCLOAK_CLIENT_ID !== undefined &&
          env.AUTH_KEYCLOAK_CLIENT_SECRET !== undefined &&
          env.AUTH_KEYCLOAK_ISSUER !== undefined
            ? env.AUTH_KEYCLOAK_NAME !== undefined
              ? { name: env.AUTH_KEYCLOAK_NAME }
              : true
            : false,
        workos:
          env.AUTH_WORKOS_CLIENT_ID !== undefined &&
          env.AUTH_WORKOS_CLIENT_SECRET !== undefined
            ? env.AUTH_WORKOS_ORGANIZATION_ID !== undefined
              ? { organizationId: env.AUTH_WORKOS_ORGANIZATION_ID }
              : env.AUTH_WORKOS_CONNECTION_ID !== undefined
                ? { connectionId: env.AUTH_WORKOS_CONNECTION_ID }
                : true
            : false,
        wordpress:
          env.AUTH_WORDPRESS_CLIENT_ID !== undefined &&
          env.AUTH_WORDPRESS_CLIENT_SECRET !== undefined,
        custom:
          env.AUTH_CUSTOM_CLIENT_ID !== undefined &&
          env.AUTH_CUSTOM_CLIENT_SECRET !== undefined &&
          env.AUTH_CUSTOM_ISSUER !== undefined &&
          env.AUTH_CUSTOM_NAME !== undefined
            ? { name: env.AUTH_CUSTOM_NAME }
            : false,
        sso,
      },
      signUpDisabled: env.AUTH_DISABLE_SIGNUP === "true",
      runningOnHuggingFaceSpaces: env.NEXTAUTH_URL?.replace(
        "/api/auth",
        "",
      ).endsWith(".hf.space"),
    },
  };
};

type NextAuthProvider = NonNullable<Parameters<typeof signIn>[0]>;

// Also used in src/pages/auth/sign-up.tsx
export function SSOButtons({
  authProviders,
  action = "sign in",
  lastUsedMethod,
  onProviderSelect,
}: {
  authProviders: PageProps["authProviders"];
  action?: string;
  lastUsedMethod?: NextAuthProvider | null;
  onProviderSelect?: (provider: NextAuthProvider) => void;
}) {
  const capture = usePostHogClientCapture();
  const [providerSigningIn, setProviderSigningIn] =
    useState<NextAuthProvider | null>(null);

  // Count available auth methods (including credentials if available)
  const availableProviders = Object.entries(authProviders).filter(
    ([name, enabled]) => enabled && name !== "sso", // sso is just a flag, not an actual provider
  );
  const hasMultipleAuthMethods = availableProviders.length > 1;

  const handleSignIn = (provider: NextAuthProvider) => {
    setProviderSigningIn(provider);
    capture("sign_in:button_click", { provider });

    // Notify parent component about provider selection
    onProviderSelect?.(provider);

    signIn(provider)
      .then(() => {
        // do not reset loadingProvider here, as the page will reload
      })
      .catch((error) => {
        console.error(error);
        setProviderSigningIn(null);
      });
  };

  // Only show separator if credentials are enabled (for sign-in) or if action is sign-up (which always has the form)
  const showSeparator = authProviders.credentials || action !== "sign in";

  return (
    // any authprovider from props is enabled
    Object.entries(authProviders).some(
      ([name, enabled]) => enabled && name !== "credentials",
    ) ? (
      <div>
        {showSeparator ? (
          action === "sign in" ? (
            <div className="my-6 border-t border-border"></div>
          ) : (
            <div className="my-6 text-center text-xs text-muted-foreground">
              or {action} with
            </div>
          )
        ) : null}
        <div className="flex flex-row flex-wrap items-center justify-center gap-2">
          {authProviders.google && (
            <AuthProviderButton
              icon={<SiGoogle className="mr-3" size={18} />}
              label="Google"
              onClick={() => handleSignIn("google")}
              loading={providerSigningIn === "google"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "google"
              }
            />
          )}
          {authProviders.github && (
            <AuthProviderButton
              icon={<SiGithub className="mr-3" size={18} />}
              label="GitHub"
              onClick={() => handleSignIn("github")}
              loading={providerSigningIn === "github"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "github"
              }
            />
          )}
          {authProviders.githubEnterprise && (
            <AuthProviderButton
              icon={<SiGithub className="mr-3" size={18} />}
              label="GitHub Enterprise"
              onClick={() => handleSignIn("github-enterprise")}
              loading={providerSigningIn === "github-enterprise"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "github-enterprise"
              }
            />
          )}
          {authProviders.gitlab && (
            <AuthProviderButton
              icon={<SiGitlab className="mr-3" size={18} />}
              label="Gitlab"
              onClick={() => handleSignIn("gitlab")}
              loading={providerSigningIn === "gitlab"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "gitlab"
              }
            />
          )}
          {authProviders.azureAd && (
            <AuthProviderButton
              icon={<TbBrandAzure className="mr-3" size={18} />}
              label="Azure AD"
              onClick={() => handleSignIn("azure-ad")}
              loading={providerSigningIn === "azure-ad"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "azure-ad"
              }
            />
          )}
          {authProviders.okta && (
            <AuthProviderButton
              icon={<SiOkta className="mr-3" size={18} />}
              label="Okta"
              onClick={() => handleSignIn("okta")}
              loading={providerSigningIn === "okta"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "okta"
              }
            />
          )}
          {authProviders.authentik && (
            <AuthProviderButton
              icon={<SiAuthentik className="mr-3" size={18} />}
              label="Authentik"
              onClick={() => handleSignIn("authentik")}
              loading={providerSigningIn === "authentik"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "authentik"
              }
            />
          )}
          {authProviders.onelogin && (
            <AuthProviderButton
              icon={<Key className="mr-3" size={18} />}
              label="OneLogin"
              onClick={() => handleSignIn("onelogin")}
              loading={providerSigningIn === "onelogin"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "onelogin"
              }
            />
          )}
          {authProviders.auth0 && (
            <AuthProviderButton
              icon={<SiAuth0 className="mr-3" size={18} />}
              label="Auth0"
              onClick={() => handleSignIn("auth0")}
              loading={providerSigningIn === "auth0"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "auth0"
              }
            />
          )}
          {authProviders.clickhouseCloud && (
            <AuthProviderButton
              icon={<SiClickhouse className="mr-3" size={18} />}
              label="ClickHouse Cloud"
              onClick={() => handleSignIn("clickhouse-cloud")}
              loading={providerSigningIn === "clickhouse-cloud"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "clickhouse-cloud"
              }
            />
          )}
          {authProviders.cognito && (
            <AuthProviderButton
              icon={<SiAmazoncognito className="mr-3" size={18} />}
              label="Cognito"
              onClick={() => handleSignIn("cognito")}
              loading={providerSigningIn === "cognito"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "cognito"
              }
            />
          )}
          {authProviders.keycloak && (
            <AuthProviderButton
              icon={<SiKeycloak className="mr-3" size={18} />}
              label={
                typeof authProviders.keycloak === "object"
                  ? authProviders.keycloak.name
                  : "Keycloak"
              }
              onClick={() => {
                capture("sign_in:button_click", { provider: "keycloak" });
                onProviderSelect?.("keycloak");
                void signIn("keycloak");
              }}
              loading={providerSigningIn === "keycloak"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "keycloak"
              }
            />
          )}
          {typeof authProviders.workos === "object" &&
            "connectionId" in authProviders.workos && (
              <AuthProviderButton
                icon={<Code className="mr-3" size={18} />}
                label="WorkOS"
                onClick={() => {
                  capture("sign_in:button_click", { provider: "workos" });
                  onProviderSelect?.("workos");
                  void signIn("workos", undefined, {
                    connection: (
                      authProviders.workos as { connectionId: string }
                    ).connectionId,
                  });
                }}
                loading={providerSigningIn === "workos"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "workos"
                }
              />
            )}
          {typeof authProviders.workos === "object" &&
            "organizationId" in authProviders.workos && (
              <AuthProviderButton
                icon={<Code className="mr-3" size={18} />}
                label="WorkOS"
                onClick={() => {
                  capture("sign_in:button_click", { provider: "workos" });
                  onProviderSelect?.("workos");
                  void signIn("workos", undefined, {
                    organization: (
                      authProviders.workos as { organizationId: string }
                    ).organizationId,
                  });
                }}
                loading={providerSigningIn === "workos"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "workos"
                }
              />
            )}
          {authProviders.workos === true && (
            <>
              <AuthProviderButton
                icon={<Code className="mr-3" size={18} />}
                label="WorkOS (organization)"
                onClick={() => {
                  const organization = window.prompt(
                    "Please enter your organization ID",
                  );
                  if (organization) {
                    capture("sign_in:button_click", { provider: "workos" });
                    onProviderSelect?.("workos");
                    void signIn("workos", undefined, {
                      organization,
                    });
                  }
                }}
                loading={providerSigningIn === "workos"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "workos"
                }
              />
              <AuthProviderButton
                icon={<Code className="mr-3" size={18} />}
                label="WorkOS (connection)"
                onClick={() => {
                  const connection = window.prompt(
                    "Please enter your connection ID",
                  );
                  if (connection) {
                    capture("sign_in:button_click", { provider: "workos" });
                    onProviderSelect?.("workos");
                    void signIn("workos", undefined, {
                      connection,
                    });
                  }
                }}
                loading={providerSigningIn === "workos"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "workos"
                }
              />
            </>
          )}
          {authProviders.wordpress && (
            <AuthProviderButton
              icon={<SiWordpress className="mr-3" size={18} />}
              label="WordPress"
              onClick={() => handleSignIn("wordpress")}
              loading={providerSigningIn === "wordpress"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "wordpress"
              }
            />
          )}
          {authProviders.custom && (
            <AuthProviderButton
              icon={<TbBrandOauth className="mr-3" size={18} />}
              label={authProviders.custom.name}
              onClick={() => handleSignIn("custom")}
              loading={providerSigningIn === "custom"}
              showLastUsedBadge={
                hasMultipleAuthMethods && lastUsedMethod === "custom"
              }
            />
          )}
        </div>
      </div>
    ) : null
  );
}

/**
 * Redirect to HuggingFace Spaces auth page (/auth/hf-spaces) if running in an iframe on a HuggingFace host.
 * The iframe detection needs to happen client-side since window/document objects are not available during SSR.
 * @param runningOnHuggingFaceSpaces - whether the app is running on a HuggingFace spaces, needs to be checked server-side
 */
export function useHuggingFaceRedirect(runningOnHuggingFaceSpaces: boolean) {
  const router = useRouter();

  useEffect(() => {
    const isInIframe = () => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    };

    if (
      runningOnHuggingFaceSpaces &&
      typeof window !== "undefined" &&
      isInIframe()
    ) {
      void router.push("/auth/hf-spaces");
    }
  }, [router, runningOnHuggingFaceSpaces]);
}

const signInErrors = [
  {
    code: "OAuthAccountNotLinked",
    description:
      "Please sign in with the same provider (e.g. Google, GitHub, Azure AD, etc.) that you used to create this account.",
  },
];

export default function SignIn({
  authProviders,
  signUpDisabled,
  runningOnHuggingFaceSpaces,
}: PageProps) {
  const router = useRouter();
  useHuggingFaceRedirect(runningOnHuggingFaceSpaces);

  // handle NextAuth error codes: https://next-auth.js.org/configuration/pages#sign-in-page
  const nextAuthError =
    typeof router.query.error === "string"
      ? decodeURIComponent(router.query.error)
      : null;
  const nextAuthErrorDescription =
    typeof router.query.error_description === "string"
      ? decodeURIComponent(router.query.error_description)
      : null;

  // Use error_description from IdP if available, otherwise use mapped error or error code
  const errorMessage = nextAuthErrorDescription
    ? nextAuthErrorDescription
    : (signInErrors.find((e) => e.code === nextAuthError)?.description ??
      nextAuthError);

  useEffect(() => {
    // log unexpected sign in errors to Sentry
    // An error is unexpected if it's not in our mapped errors and has no IdP error_description
    if (
      nextAuthError &&
      !nextAuthErrorDescription &&
      !signInErrors.find((e) => e.code === nextAuthError)
    ) {
      captureException(new Error(`Sign in error: ${nextAuthError}`));
    }
  }, [nextAuthError, nextAuthErrorDescription]);

  const [credentialsFormError, setCredentialsFormError] = useState<
    string | null
  >(errorMessage);
  // Two-step login flow: ask for email first, detect SSO, then either redirect to SSO or reveal password field.
  // Skip this flow when no SSO is configured - show password field immediately
  const [showPasswordStep, setShowPasswordStep] = useState<boolean>(
    !authProviders.sso,
  );
  const [continueLoading, setContinueLoading] = useState<boolean>(false);
  const [lastUsedAuthMethod, setLastUsedAuthMethod] =
    useLocalStorage<NextAuthProvider | null>(
      "langfuse_last_used_auth_method",
      null,
    );

  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();

  // Count available auth methods to determine if we should show "Last used" badge
  const availableProviders = Object.entries(authProviders).filter(
    ([name, enabled]) => enabled && name !== "sso", // sso is just a flag, not an actual provider
  );
  const hasMultipleAuthMethods = availableProviders.length > 1;

  // Read query params for targetPath and email pre-population
  const queryTargetPath = router.query.targetPath as string | undefined;
  const emailParam = router.query.email as string | undefined;

  // Validate targetPath to prevent open redirect attacks
  const targetPath = queryTargetPath
    ? getSafeRedirectPath(queryTargetPath)
    : undefined;

  // Credentials
  const credentialsForm = useForm({
    resolver: zodResolver(credentialAuthForm),
    defaultValues: {
      email: emailParam ?? "",
      password: "",
    },
  });
  async function onCredentialsSubmit(
    values: z.infer<typeof credentialAuthForm>,
  ) {
    setCredentialsFormError(null);
    try {
      capture("sign_in:button_click", { provider: "email/password" });

      // Store credentials as the last used auth method before signing in
      setLastUsedAuthMethod("credentials");

      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl: targetPath ?? "/",
        redirect: false,
      });
      if (result === undefined) {
        setCredentialsFormError("An unexpected error occurred.");
        captureException(new Error("Sign in result is undefined"));
      } else if (!result.ok) {
        if (!result.error) {
          captureException(
            new Error(
              `Sign in result error is falsy, result: ${JSON.stringify(result)}`,
            ),
          );
        }
        setCredentialsFormError(
          result?.error ?? "An unexpected error occurred.",
        );
      }
    } catch (error) {
      captureException(error);
      console.error(error);
      setCredentialsFormError("An unexpected error occurred.");
    }
  }

  /**
   * First-step handler ("Continue" button).
   * 1. Validates email.
   * 2. Queries backend to see if a tenant-specific SSO provider is configured.
   *    ‑ If found: redirects to that provider immediately.
   *    ‑ Otherwise: reveals password input so the user can finish with credentials.
   * 3. Gracefully handles network errors and edge cases.
   */
  async function handleContinue() {
    setContinueLoading(true);
    setCredentialsFormError(null);
    credentialsForm.clearErrors();

    // Ensure email is valid before hitting the API
    const emailSchema = z.string().email();
    const email = emailSchema.safeParse(credentialsForm.getValues("email"));
    if (!email.success) {
      credentialsForm.setError("email", {
        message: "Invalid email address",
      });
      setContinueLoading(false);
      return;
    }

    // Extract domain and check whether SSO is configured for it
    const domain = email.data.split("@")[1]?.toLowerCase();

    try {
      const res = await fetch(
        `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth/check-sso`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        },
      );

      if (res.ok) {
        // Enterprise SSO found – redirect straight away
        const { providerId } = await res.json();
        capture("sign_in:button_click", { provider: "sso_auto" });

        // Store the SSO provider as the last used auth method
        setLastUsedAuthMethod(providerId as NextAuthProvider);

        void signIn(providerId);
        return; // stop further execution – page redirect expected
      }

      // No SSO – fall back to password step
      setShowPasswordStep(true);

      // Auto-focus password input when password step becomes visible
      setTimeout(() => {
        // Find and focus the password input
        // Ref did not work, so we use a more specific selector
        const passwordInput = document.querySelector(
          'input[name="password"]',
        ) as HTMLInputElement;
        if (passwordInput) {
          passwordInput.focus();
        }
      }, 100);
    } catch (error) {
      console.error(error);
      setCredentialsFormError(
        "Unable to check SSO configuration. Please try again.",
      );
    } finally {
      setContinueLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Sign in | Langfuse</title>
      </Head>
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon className="mx-auto" />
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-primary">
            Sign in to your account
          </h2>
        </div>

        {isLangfuseCloud && (
          <div className="-mb-4 mt-4 rounded-lg bg-card p-3 text-center text-sm sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-6">
            If you are experiencing issues signing in, please force refresh this
            page (CMD + SHIFT + R) or clear your browser cache.{" "}
            <a
              href="mailto:support@langfuse.com"
              className="cursor-pointer whitespace-nowrap text-xs font-medium text-primary-accent hover:text-hover-primary-accent"
            >
              (contact us)
            </a>
          </div>
        )}

        <CloudRegionSwitch />

        <div className="mt-14 bg-background px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            {/* Email / (optional) password form – only when credentials auth is enabled */}
            {authProviders.credentials && (
              <div>
                <Form {...credentialsForm}>
                  <form
                    className="space-y-6"
                    onSubmit={
                      showPasswordStep
                        ? credentialsForm.handleSubmit(onCredentialsSubmit)
                        : (e) => {
                            e.preventDefault();
                            void handleContinue();
                          }
                    }
                  >
                    {/* Email input – always visible */}
                    <FormField
                      control={credentialsForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="jsdoe@example.com"
                              allowPasswordManager
                              autoComplete="email"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Password only shown once we know SSO is not configured */}
                    {showPasswordStep && (
                      <FormField
                        control={credentialsForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Password{" "}
                              <Link
                                href="/auth/reset-password"
                                className="ml-1 text-xs text-primary-accent hover:text-hover-primary-accent"
                                tabIndex={-1}
                                title="What is this?"
                              >
                                (forgot password?)
                              </Link>
                            </FormLabel>
                            <FormControl>
                              <PasswordInput {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Primary action button */}
                    <Button
                      type="submit"
                      className="w-full"
                      loading={
                        showPasswordStep
                          ? credentialsForm.formState.isSubmitting
                          : continueLoading
                      }
                      disabled={
                        credentialsForm.watch("email") === "" ||
                        (showPasswordStep &&
                          credentialsForm.watch("password") === "")
                      }
                      data-testid="submit-email-password-sign-in-form"
                    >
                      {showPasswordStep ? "Sign in" : "Continue"}
                    </Button>
                  </form>
                </Form>
                <div
                  className={cn(
                    "mt-1 text-center text-xs text-muted-foreground",
                    hasMultipleAuthMethods &&
                      lastUsedAuthMethod === "credentials"
                      ? "block"
                      : "hidden",
                  )}
                >
                  Last used
                </div>
              </div>
            )}
            {credentialsFormError ? (
              <div className="text-center text-sm font-medium text-destructive">
                {credentialsFormError}
                <br />
                Contact support if this error is unexpected.{" "}
                {isLangfuseCloud &&
                  "Make sure you are using the correct cloud data region."}
              </div>
            ) : null}
            <SSOButtons
              authProviders={authProviders}
              lastUsedMethod={lastUsedAuthMethod}
              onProviderSelect={setLastUsedAuthMethod}
            />
          </div>

          {!signUpDisabled &&
          env.NEXT_PUBLIC_SIGN_UP_DISABLED !== "true" &&
          authProviders.credentials ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">
              No account yet?{" "}
              <Link
                href={`/auth/sign-up${router.asPath.includes("?") ? router.asPath.substring(router.asPath.indexOf("?")) : ""}`}
                className="font-semibold leading-6 text-primary-accent hover:text-hover-primary-accent"
              >
                Sign up
              </Link>
            </p>
          ) : null}
        </div>
        <CloudPrivacyNotice action="signing in" />
      </div>
    </>
  );
}
