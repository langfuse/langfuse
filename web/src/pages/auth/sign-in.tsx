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
  SiAuth0,
  SiAmazoncognito,
  SiKeycloak,
  SiGoogle,
  SiGitlab,
  SiGithub,
} from "react-icons/si";
import { TbBrandAzure, TbBrandOauth } from "react-icons/tb";
import { signIn } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/v4";
import { Divider } from "@tremor/react";
import { CloudPrivacyNotice } from "@/src/features/auth/components/AuthCloudPrivacyNotice";
import { CloudRegionSwitch } from "@/src/features/auth/components/AuthCloudRegionSwitch";
import { PasswordInput } from "@/src/components/ui/password-input";
import { Turnstile } from "@marsidev/react-turnstile";
import { isAnySsoConfigured } from "@/src/ee/features/multi-tenant-sso/utils";
import { Code } from "lucide-react";
import { useRouter } from "next/router";
import { captureException } from "@sentry/nextjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { openChat } from "@/src/features/support-chat/PlainChat";

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
    azureAd: boolean;
    auth0: boolean;
    cognito: boolean;
    keycloak: boolean;
    workos:
      | {
          organizationId: string;
        }
      | {
          connectionId: string;
        }
      | boolean;
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
// eslint-disable-next-line @typescript-eslint/require-await
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
        credentials: env.AUTH_DISABLE_USERNAME_PASSWORD !== "true",
        azureAd:
          env.AUTH_AZURE_AD_CLIENT_ID !== undefined &&
          env.AUTH_AZURE_AD_CLIENT_SECRET !== undefined &&
          env.AUTH_AZURE_AD_TENANT_ID !== undefined,
        auth0:
          env.AUTH_AUTH0_CLIENT_ID !== undefined &&
          env.AUTH_AUTH0_CLIENT_SECRET !== undefined &&
          env.AUTH_AUTH0_ISSUER !== undefined,
        cognito:
          env.AUTH_COGNITO_CLIENT_ID !== undefined &&
          env.AUTH_COGNITO_CLIENT_SECRET !== undefined &&
          env.AUTH_COGNITO_ISSUER !== undefined,
        keycloak:
          env.AUTH_KEYCLOAK_CLIENT_ID !== undefined &&
          env.AUTH_KEYCLOAK_CLIENT_SECRET !== undefined &&
          env.AUTH_KEYCLOAK_ISSUER !== undefined,
        workos:
          env.AUTH_WORKOS_CLIENT_ID !== undefined &&
          env.AUTH_WORKOS_CLIENT_SECRET !== undefined
            ? env.AUTH_WORKOS_ORGANIZATION_ID !== undefined
              ? { organizationId: env.AUTH_WORKOS_ORGANIZATION_ID }
              : env.AUTH_WORKOS_CONNECTION_ID !== undefined
                ? { connectionId: env.AUTH_WORKOS_CONNECTION_ID }
                : true
            : false,
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
}: {
  authProviders: PageProps["authProviders"];
  action?: string;
}) {
  const capture = usePostHogClientCapture();
  const [providerSigningIn, setProviderSigningIn] =
    useState<NextAuthProvider | null>(null);

  const handleSignIn = (provider: NextAuthProvider) => {
    setProviderSigningIn(provider);
    capture("sign_in:button_click", { provider });
    signIn(provider)
      .then(() => {
        // do not reset loadingProvider here, as the page will reload
      })
      .catch((error) => {
        console.error(error);
        setProviderSigningIn(null);
      });
  };

  return (
    // any authprovider from props is enabled
    Object.entries(authProviders).some(
      ([name, enabled]) => enabled && name !== "credentials",
    ) ? (
      <div>
        {authProviders.credentials && (
          <Divider className="text-muted-foreground">or {action} with</Divider>
        )}
        <div className="flex flex-row flex-wrap items-center justify-center gap-4">
          {authProviders.google && (
            <Button
              onClick={() => handleSignIn("google")}
              variant="secondary"
              loading={providerSigningIn === "google"}
            >
              <SiGoogle className="mr-3" size={18} />
              Google
            </Button>
          )}
          {authProviders.github && (
            <Button
              onClick={() => handleSignIn("github")}
              variant="secondary"
              loading={providerSigningIn === "github"}
            >
              <SiGithub className="mr-3" size={18} />
              GitHub
            </Button>
          )}
          {authProviders.githubEnterprise && (
            <Button
              onClick={() => handleSignIn("github-enterprise")}
              variant="secondary"
              loading={providerSigningIn === "github-enterprise"}
            >
              <SiGithub className="mr-3" size={18} />
              GitHub Enterprise
            </Button>
          )}
          {authProviders.gitlab && (
            <Button
              onClick={() => handleSignIn("gitlab")}
              variant="secondary"
              loading={providerSigningIn === "gitlab"}
            >
              <SiGitlab className="mr-3" size={18} />
              Gitlab
            </Button>
          )}
          {authProviders.azureAd && (
            <Button
              onClick={() => handleSignIn("azure-ad")}
              variant="secondary"
              loading={providerSigningIn === "azure-ad"}
            >
              <TbBrandAzure className="mr-3" size={18} />
              Azure AD
            </Button>
          )}
          {authProviders.okta && (
            <Button
              onClick={() => handleSignIn("okta")}
              variant="secondary"
              loading={providerSigningIn === "okta"}
            >
              <SiOkta className="mr-3" size={18} />
              Okta
            </Button>
          )}
          {authProviders.auth0 && (
            <Button
              onClick={() => handleSignIn("auth0")}
              variant="secondary"
              loading={providerSigningIn === "auth0"}
            >
              <SiAuth0 className="mr-3" size={18} />
              Auth0
            </Button>
          )}
          {authProviders.cognito && (
            <Button
              onClick={() => handleSignIn("cognito")}
              variant="secondary"
              loading={providerSigningIn === "cognito"}
            >
              <SiAmazoncognito className="mr-3" size={18} />
              Cognito
            </Button>
          )}
          {authProviders.keycloak && (
            <Button
              onClick={() => {
                capture("sign_in:button_click", { provider: "keycloak" });
                void signIn("keycloak");
              }}
              variant="secondary"
            >
              <SiKeycloak className="mr-3" size={18} />
              Keycloak
            </Button>
          )}
          {typeof authProviders.workos === "object" &&
            "connectionId" in authProviders.workos && (
              <Button
                onClick={() => {
                  capture("sign_in:button_click", { provider: "workos" });
                  void signIn("workos", undefined, {
                    connection: (
                      authProviders.workos as { connectionId: string }
                    ).connectionId,
                  });
                }}
                variant="secondary"
              >
                <Code className="mr-3" size={18} />
                WorkOS
              </Button>
            )}
          {typeof authProviders.workos === "object" &&
            "organizationId" in authProviders.workos && (
              <Button
                onClick={() => {
                  capture("sign_in:button_click", { provider: "workos" });
                  void signIn("workos", undefined, {
                    organization: (
                      authProviders.workos as { organizationId: string }
                    ).organizationId,
                  });
                }}
                variant="secondary"
              >
                <Code className="mr-3" size={18} />
                WorkOS
              </Button>
            )}
          {authProviders.workos === true && (
            <>
              <Button
                onClick={() => {
                  const organization = window.prompt(
                    "Please enter your organization ID",
                  );
                  if (organization) {
                    capture("sign_in:button_click", { provider: "workos" });
                    void signIn("workos", undefined, {
                      organization,
                    });
                  }
                }}
                variant="secondary"
              >
                <Code className="mr-3" size={18} />
                WorkOS (organization)
              </Button>
              <Button
                onClick={() => {
                  const connection = window.prompt(
                    "Please enter your connection ID",
                  );
                  if (connection) {
                    capture("sign_in:button_click", { provider: "workos" });
                    void signIn("workos", undefined, {
                      connection,
                    });
                  }
                }}
                variant="secondary"
              >
                <Code className="mr-3" size={18} />
                WorkOS (connection)
              </Button>
            </>
          )}
          {authProviders.custom && (
            <Button
              onClick={() => handleSignIn("custom")}
              variant="secondary"
              loading={providerSigningIn === "custom"}
            >
              <TbBrandOauth className="mr-3" size={18} />
              {authProviders.custom.name}
            </Button>
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
      } catch (e) {
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
  const nextAuthErrorDescription = signInErrors.find(
    (e) => e.code === nextAuthError,
  )?.description;
  useEffect(() => {
    // log unexpected sign in errors to Sentry
    if (nextAuthError && !nextAuthErrorDescription) {
      captureException(new Error(`Sign in error: ${nextAuthError}`));
    }
  }, [nextAuthError, nextAuthErrorDescription]);

  const [credentialsFormError, setCredentialsFormError] = useState<
    string | null
  >(nextAuthErrorDescription ?? nextAuthError);
  // Two-step login flow: ask for email first, detect SSO, then either redirect to SSO or reveal password field.
  // Skip this flow when no SSO is configured - show password field immediately
  const [showPasswordStep, setShowPasswordStep] = useState<boolean>(
    !authProviders.sso,
  );
  const [continueLoading, setContinueLoading] = useState<boolean>(false);

  const capture = usePostHogClientCapture();
  const [turnstileToken, setTurnstileToken] = useState<string>();
  // Used to refresh turnstile as the token can only be used once
  const [turnstileCData, setTurnstileCData] = useState<string>(
    new Date().getTime().toString(),
  );

  // Credentials
  const credentialsForm = useForm({
    resolver: zodResolver(credentialAuthForm),
    defaultValues: {
      email: "",
      password: "",
    },
  });
  async function onCredentialsSubmit(
    values: z.infer<typeof credentialAuthForm>,
  ) {
    setCredentialsFormError(null);
    try {
      capture("sign_in:button_click", { provider: "email/password" });
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl: "/",
        redirect: false,
        turnstileToken,
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
    } finally {
      // Refresh turnstile as the token can only be used once
      if (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && turnstileToken) {
        setTurnstileCData(new Date().getTime().toString());
        setTurnstileToken(undefined);
      }
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

        {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined && (
          <div className="-mb-4 mt-4 rounded-lg bg-card p-3 text-center text-sm sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-6">
            If you are experiencing issues signing in, please force refresh this
            page (CMD + SHIFT + R) or clear your browser cache. We are working
            on a solution.{" "}
            <span
              className="cursor-pointer whitespace-nowrap text-xs font-medium text-primary-accent hover:text-hover-primary-accent"
              onClick={() => openChat()}
            >
              (contact us)
            </span>
          </div>
        )}

        <CloudRegionSwitch />

        <div className="mt-14 bg-background px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            {/* Email / (optional) password form – only when credentials auth is enabled */}
            {authProviders.credentials && (
              <Form {...credentialsForm}>
                <form
                  className="space-y-6"
                  // eslint-disable-next-line @typescript-eslint/no-misused-promises
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
                          <Input placeholder="jsdoe@example.com" {...field} />
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
                      (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY !== undefined &&
                        showPasswordStep &&
                        turnstileToken === undefined) ||
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
            )}
            {credentialsFormError ? (
              <div className="text-center text-sm font-medium text-destructive">
                {credentialsFormError}
                <br />
                Contact support if this error is unexpected.{" "}
                {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined &&
                  "Make sure you are using the correct cloud data region."}
              </div>
            ) : null}
            <SSOButtons authProviders={authProviders} />
          </div>
          {
            // Turnstile exists copy-paste also on sign-up.tsx
            env.NEXT_PUBLIC_TURNSTILE_SITE_KEY !== undefined && (
              <>
                <Divider className="text-muted-foreground" />
                <Turnstile
                  siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                  options={{
                    theme: "light",
                    action: "sign-in",
                    cData: turnstileCData,
                  }}
                  className="mx-auto"
                  onSuccess={setTurnstileToken}
                />
              </>
            )
          }

          {!signUpDisabled &&
          env.NEXT_PUBLIC_SIGN_UP_DISABLED !== "true" &&
          authProviders.credentials ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">
              No account yet?{" "}
              <Link
                href="/auth/sign-up"
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
