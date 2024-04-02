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
import { SiOkta, SiAuth0 } from "react-icons/si";
import { TbBrandAzure } from "react-icons/tb";
import { signIn } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { usePostHog } from "posthog-js/react";
import { Divider } from "@tremor/react";
import { CloudPrivacyNotice } from "@/src/features/auth/components/AuthCloudPrivacyNotice";
import { CloudRegionSwitch } from "@/src/features/auth/components/AuthCloudRegionSwitch";
import { PasswordInput } from "@/src/components/ui/password-input";
import { Turnstile } from "@marsidev/react-turnstile";

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
  };
};

// Also used in src/pages/auth/sign-up.tsx
// eslint-disable-next-line @typescript-eslint/require-await
export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
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
      },
    },
  };
};

// Also used in src/pages/auth/sign-up.tsx
export function SSOButtons({
  authProviders,
  action = "Sign in",
}: PageProps & { action?: string }) {
  const posthog = usePostHog();

  return (
    // any authprovider from props is enanbles
    Object.entries(authProviders).some(
      ([name, enabled]) => enabled && name !== "credentials",
    ) ? (
      <div>
        {authProviders.credentials && <Divider className="text-gray-400" />}
        <div className="flex flex-row flex-wrap items-center justify-center gap-4">
          {authProviders.google && (
            <Button
              onClick={() => {
                posthog.capture("sign_in:google_button_click");
                void signIn("google");
              }}
              variant="secondary"
            >
              <FcGoogle className="mr-3" size={18} />
              {action} with Google
            </Button>
          )}
          {authProviders.github && (
            <Button
              onClick={() => {
                posthog.capture("sign_in:github_button_click");
                void signIn("github");
              }}
              variant="secondary"
            >
              <FaGithub className="mr-3" size={18} />
              {action} with Github
            </Button>
          )}
          {authProviders.azureAd && (
            <Button
              onClick={() => {
                posthog.capture("sign_in:azure_ad_button_click");
                void signIn("azure-ad");
              }}
              variant="secondary"
            >
              <TbBrandAzure className="mr-3" size={18} />
              {action} with Azure AD
            </Button>
          )}
          {authProviders.okta && (
            <Button
              onClick={() => {
                posthog.capture("sign_in:okta_button_click");
                void signIn("okta");
              }}
              variant="secondary"
            >
              <SiOkta className="mr-3" size={18} />
              {action} with Okta
            </Button>
          )}
          {authProviders.auth0 && (
            <Button
              onClick={() => {
                posthog.capture("sign_in:auth0_button_click");
                void signIn("auth0");
              }}
              variant="secondary"
            >
              <SiAuth0 className="mr-3" size={18} />
              {action} with Auth0
            </Button>
          )}
        </div>
      </div>
    ) : null
  );
}

export default function SignIn({ authProviders }: PageProps) {
  const [credentialsFormError, setCredentialsFormError] = useState<
    string | null
  >(null);

  const posthog = usePostHog();
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
    posthog.capture("sign_in:credentials_form_submit");
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      callbackUrl: "/",
      redirect: false,
      turnstileToken,
    });
    if (result?.error) {
      setCredentialsFormError(result.error);

      // Refresh turnstile as the token can only be used once
      if (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && turnstileToken) {
        setTurnstileCData(new Date().getTime().toString());
        setTurnstileToken(undefined);
      }
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
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
            Sign in to your account
          </h2>
        </div>

        <div className="mt-14 bg-white px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-12">
          <div className="space-y-8">
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
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <PasswordInput {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    loading={credentialsForm.formState.isSubmitting}
                  >
                    Sign in
                  </Button>
                  {credentialsFormError ? (
                    <div className="text-center text-sm font-medium text-destructive">
                      {credentialsFormError}
                      <br />
                      Contact support if this error is unexpected.
                    </div>
                  ) : null}
                </form>
              </Form>
            ) : null}
            <SSOButtons authProviders={authProviders} />
          </div>
          {env.NEXT_PUBLIC_TURNSTILE_SITE_KEY !== undefined && (
            <>
              <Divider className="text-gray-400" />
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
          )}
          <CloudPrivacyNotice action="signing in" />
        </div>

        {env.NEXT_PUBLIC_SIGN_UP_DISABLED !== "true" &&
        authProviders.credentials ? (
          <p className="mt-10 text-center text-sm text-gray-500">
            No account yet?{" "}
            <Link
              href="/auth/sign-up"
              className="font-semibold leading-6 text-indigo-600 hover:text-indigo-500"
            >
              Sign up
            </Link>
          </p>
        ) : null}
      </div>
    </>
  );
}
