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
import { signupSchema } from "@/src/features/auth/lib/signupSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useForm } from "react-hook-form";
import * as z from "zod/v4";
import { env } from "@/src/env.mjs";
import { useState } from "react";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { CloudPrivacyNotice } from "@/src/features/auth/components/AuthCloudPrivacyNotice";
import { CloudRegionSwitch } from "@/src/features/auth/components/AuthCloudRegionSwitch";
import {
  SSOButtons,
  useHuggingFaceRedirect,
  type PageProps,
} from "@/src/pages/auth/sign-in";
import { PasswordInput } from "@/src/components/ui/password-input";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useRouter } from "next/router";
import { getSafeRedirectPath } from "@/src/utils/redirect";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useLocalStorage from "@/src/components/useLocalStorage";

// Use the same getServerSideProps function as src/pages/auth/sign-in.tsx
export { getServerSideProps } from "@/src/pages/auth/sign-in";

type NextAuthProvider = NonNullable<Parameters<typeof signIn>[0]>;

export default function SignIn({
  authProviders,
  runningOnHuggingFaceSpaces,
}: PageProps) {
  useHuggingFaceRedirect(runningOnHuggingFaceSpaces);
  const { isLangfuseCloud, region } = useLangfuseCloudRegion();
  const router = useRouter();
  const capture = usePostHogClientCapture();

  // Read query params for targetPath and email pre-population
  const queryTargetPath = router.query.targetPath as string | undefined;
  const emailParam = router.query.email as string | undefined;

  // Validate targetPath to prevent open redirect attacks
  const targetPath = queryTargetPath
    ? getSafeRedirectPath(queryTargetPath)
    : undefined;

  const [formError, setFormError] = useState<string | null>(null);

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

  const form = useForm({
    resolver: showPasswordStep ? zodResolver(signupSchema) : undefined,
    defaultValues: {
      name: "",
      email: emailParam ?? "",
      password: "",
    },
  });

  async function handleContinue() {
    setContinueLoading(true);
    setFormError(null);
    form.clearErrors();

    // Ensure email is valid before hitting the API
    // We use z.string().email() manually because we don't use the full schema resolver in the first step
    // or we could just trigger validation for the email field only
    const emailValue = form.getValues("email");
    // Basic check using zod directly or trigger
    // Using trigger("email") might validate against the full schema if we don't be careful,
    // but since we conditionally set the resolver, it might be tricky.
    // Simplest is manual check here matching what sign-in does.
    // Note: signupSchema has name and password as required, so trigger() would fail on those if using full schema.

    // Manual email validation to match sign-in behavior
    // Although signupSchema.shape.email is ZodString, let's just use a new Zod check for simplicity and robustness
    const emailSchema = z.string().email();
    const emailResult = emailSchema.safeParse(emailValue);

    if (!emailResult.success) {
      form.setError("email", {
        message: "Invalid email address",
      });
      setContinueLoading(false);
      return;
    }

    // Extract domain and check whether SSO is configured for it
    const domain = emailResult.data.split("@")[1]?.toLowerCase();

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
        capture("sign_up:button_click", { provider: "sso_auto" });

        // Store the SSO provider as the last used auth method
        setLastUsedAuthMethod(providerId as NextAuthProvider);

        void signIn(providerId);
        return; // stop further execution – page redirect expected
      }

      // No SSO – fall back to password step
      setShowPasswordStep(true);

      // Auto-focus password input when password step becomes visible
      setTimeout(() => {
        // Find and focus the name input (since it's the first new field) or password?
        // Plan says "name + password fields". Usually Name is first in Sign Up.
        // Let's focus Name.
        const nameInput = document.querySelector(
          'input[name="name"]',
        ) as HTMLInputElement;
        if (nameInput) {
          nameInput.focus();
        }
      }, 100);
    } catch (error) {
      console.error(error);
      setFormError("Unable to check SSO configuration. Please try again.");
    } finally {
      setContinueLoading(false);
    }
  }

  async function onSubmit(values: z.infer<typeof signupSchema>) {
    try {
      setFormError(null);
      const res = await fetch(
        `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth/signup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );

      if (!res.ok) {
        const payload = (await res.json()) as { message: string };
        setFormError(payload.message);
        return;
      }

      await signIn<"credentials">("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl:
          targetPath ??
          (isLangfuseCloud && region !== "DEV"
            ? `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/onboarding`
            : `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/`),
      });
    } catch {
      setFormError("An error occurred. Please try again.");
    }
  }

  return (
    <>
      <Head>
        <title>Sign up | Langfuse</title>
        <meta
          name="description"
          content="Create an account, no credit card required."
          key="desc"
        />
      </Head>
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon className="mx-auto" />
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-primary">
            Create new account
          </h2>
        </div>
        {isLangfuseCloud ? (
          <div className="text-center sm:mx-auto sm:w-full sm:max-w-[480px]">
            No credit card required.
          </div>
        ) : null}

        <CloudRegionSwitch isSignUpPage />

        <div className="mt-14 bg-background px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-10">
          <Form {...form}>
            <form
              className="space-y-6"
              onSubmit={
                showPasswordStep
                  ? form.handleSubmit(onSubmit)
                  : (e) => {
                      e.preventDefault();
                      void handleContinue();
                    }
              }
            >
              {showPasswordStep && (
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
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
              {showPasswordStep && (
                <FormField
                  control={form.control}
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
              )}
              <Button
                type="submit"
                className="w-full"
                loading={
                  showPasswordStep
                    ? form.formState.isSubmitting
                    : continueLoading
                }
                disabled={
                  showPasswordStep
                    ? false // Form validation handles this via handleSubmit
                    : form.watch("email") === ""
                }
                data-testid="submit-email-password-sign-up-form"
              >
                {showPasswordStep ? "Sign up" : "Continue"}
              </Button>
              {formError ? (
                <div className="text-center text-sm font-medium text-destructive">
                  {formError}
                </div>
              ) : null}
            </form>
          </Form>
          <SSOButtons
            authProviders={authProviders}
            action="sign up"
            lastUsedMethod={lastUsedAuthMethod}
            onProviderSelect={setLastUsedAuthMethod}
          />
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={`/auth/sign-in${router.asPath.includes("?") ? router.asPath.substring(router.asPath.indexOf("?")) : ""}`}
              className="font-semibold leading-6 text-primary-accent hover:text-hover-primary-accent"
            >
              Sign in
            </Link>
          </p>
        </div>
        <CloudPrivacyNotice action="creating an account" />
      </div>
    </>
  );
}
