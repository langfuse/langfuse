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
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";
import { SiOkta, SiAuth0, SiAmazoncognito } from "react-icons/si";
import { TbBrandAzure, TbBrandOauth } from "react-icons/tb";
import { signIn } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Divider } from "@tremor/react";
import { CloudPrivacyNotice } from "@/src/features/auth/components/AuthCloudPrivacyNotice";
import { CloudRegionSwitch } from "@/src/features/auth/components/AuthCloudRegionSwitch";
import { PasswordInput } from "@/src/components/ui/password-input";
import { Turnstile } from "@marsidev/react-turnstile";
import { isAnySsoConfigured } from "@langfuse/ee/sso";
import { Shield } from "lucide-react";
import { useRouter } from "next/router";
import { captureException } from "@sentry/nextjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

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
    okta: boolean;
    azureAd: boolean;
    auth0: boolean;
    cognito: boolean;
    custom:
      | {
          name: string;
        }
      | false;
    sso: boolean;
  };
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
    },
  };
};

// Also used in src/pages/auth/sign-up.tsx
export function SSOButtons({
  authProviders,
  action = "sign in",
}: {
  authProviders: PageProps["authProviders"];
  action?: string;
}) {
  const capture = usePostHogClientCapture();

  return (
    // any authprovider from props is enanbles
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
              onClick={() => {
                capture("sign_in:button_click", { provider: "google" });
                void signIn("google");
              }}
              variant="secondary"
            >
              <FcGoogle className="mr-3" size={18} />
              Google
            </Button>
          )}
          {authProviders.github && (
            <Button
              onClick={() => {
                capture("sign_in:button_click", { provider: "github" });
                void signIn("github");
              }}
              variant="secondary"
            >
              <FaGithub className="mr-3" size={18} />
              Github
            </Button>
          )}
          {authProviders.azureAd && (
            <Button
              onClick={() => {
                capture("sign_in:button_click", {
                  provider: "azure-ad",
                });
                void signIn("azure-ad");
              }}
              variant="secondary"
            >
              <TbBrandAzure className="mr-3" size={18} />
              Azure AD
            </Button>
          )}
          {authProviders.okta && (
            <Button
              onClick={() => {
                capture("sign_in:button_click", { provider: "okta" });
                void signIn("okta");
              }}
              variant="secondary"
            >
              <SiOkta className="mr-3" size={18} />
              Okta
            </Button>
          )}
          {authProviders.auth0 && (
            <Button
              onClick={() => {
                capture("sign_in:button_click", { provider: "auth0" });
                void signIn("auth0");
              }}
              variant="secondary"
            >
              <SiAuth0 className="mr-3" size={18} />
              Auth0
            </Button>
          )}
          {authProviders.cognito && (
            <Button
              onClick={() => {
                capture("sign_in:button_click", { provider: "cognito" });
                void signIn("cognito");
              }}
              variant="secondary"
            >
              <SiAmazoncognito className="mr-3" size={18} />
              Cognito
            </Button>
          )}
          {authProviders.custom && (
            <Button
              onClick={() => {
                capture("sign_in:button_click", { provider: "custom" });
                void signIn("custom");
              }}
              variant="secondary"
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

const signInErrors = [
  {
    code: "OAuthAccountNotLinked",
    description:
      "Please sign in with the same provider that you used to create this account.",
  },
];

export default function SignIn({ authProviders, signUpDisabled }: PageProps) {
  const router = useRouter();

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
  const [ssoLoading, setSsoLoading] = useState<boolean>(false);

  const capture = usePostHogClientCapture();
  const [turnstileToken, setTurnstileToken] = useState<string>();
  // Used to refresh turnstile as the token can only be used once
  const [turnstileCData, setTurnstileCData] = useState<string>(
    new Date().getTime().toString(),
  );

  // Credentials
  const credentialsForm = useForm<z.infer<typeof credentialAuthForm>>({
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

  async function handleSsoSignIn() {
    setSsoLoading(true);
    setCredentialsFormError(null);
    credentialsForm.clearErrors();
    // get current email field, verify it, add input error if not valid
    const emailSchema = z.string().email();
    const email = emailSchema.safeParse(credentialsForm.getValues("email"));
    if (!email.success) {
      credentialsForm.setError("email", {
        message: "Invalid email address",
      });
      setSsoLoading(false);
      return;
    }
    // current email domain
    const domain = email.data.split("@")[1]?.toLowerCase();
    const res = await fetch("/api/auth/check-sso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });

    if (!res.ok) {
      setCredentialsFormError("SSO is not enabled for this domain.");
      setSsoLoading(false);
    } else {
      const { providerId } = await res.json();
      capture("sign_in:button_click", { provider: "sso" });
      void signIn(providerId);
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

        <div className="mt-14 bg-background px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-12">
          <div className="space-y-6">
            <CloudRegionSwitch />
            {authProviders.credentials ? (
              <Form {...credentialsForm}>
                <form
                  className="space-y-6"
                  // eslint-disable-next-line @typescript-eslint/no-misused-promises
                  onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)}
                >
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
                  <Button
                    // this hidden button is needed to submit form by pressing enter
                    type="submit"
                    className="hidden"
                    disabled={
                      env.NEXT_PUBLIC_TURNSTILE_SITE_KEY !== undefined &&
                      turnstileToken === undefined
                    }
                  >
                    Sign in
                  </Button>
                </form>
              </Form>
            ) : null}
            <div className="flex flex-row gap-3">
              <Button
                className="w-full"
                loading={credentialsForm.formState.isSubmitting}
                disabled={
                  env.NEXT_PUBLIC_TURNSTILE_SITE_KEY !== undefined &&
                  turnstileToken === undefined
                }
                onClick={credentialsForm.handleSubmit(onCredentialsSubmit)}
                data-testid="submit-email-password-sign-in-form"
              >
                Sign in
              </Button>
              {authProviders.sso && (
                <Button
                  className="w-full"
                  variant="secondary"
                  loading={ssoLoading}
                  disabled={
                    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY !== undefined &&
                    turnstileToken === undefined
                  }
                  onClick={handleSsoSignIn}
                >
                  <Shield className="mr-3" size={18} />
                  SSO
                </Button>
              )}
            </div>
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
