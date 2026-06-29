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
import * as z from "zod";
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
import { noUrlCheck, StringNoHTMLNonEmpty } from "@langfuse/shared";

// Use the same getServerSideProps function as src/pages/auth/sign-in.tsx
export { getServerSideProps } from "@/src/pages/auth/sign-in";

type NextAuthProvider = NonNullable<Parameters<typeof signIn>[0]>;

// Schema for the verified signup flow (email + name only, no password)
const signupVerifyFormSchema = z.object({
  name: StringNoHTMLNonEmpty.refine((value) => noUrlCheck(value), {
    message: "Input should not contain a URL",
  }).refine((value) => /^[a-zA-Z0-9\s]+$/.test(value), {
    message: "Name can only contain letters, numbers, and spaces",
  }),
  email: z.email(),
});

type SignupPhase = "form" | "otp";

export default function SignUp({
  authProviders,
  runningOnHuggingFaceSpaces,
  emailVerificationRequired,
}: PageProps) {
  useHuggingFaceRedirect(runningOnHuggingFaceSpaces);

  if (emailVerificationRequired) {
    return (
      <VerifiedSignupFlow
        authProviders={authProviders}
        emailVerificationRequired={emailVerificationRequired}
      />
    );
  }

  return (
    <StandardSignupFlow
      authProviders={authProviders}
      emailVerificationRequired={emailVerificationRequired}
    />
  );
}

function StandardSignupFlow({
  authProviders,
}: Pick<PageProps, "authProviders" | "emailVerificationRequired">) {
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
    // We use z.email() manually because we don't use the full schema resolver in the first step
    // or we could just trigger validation for the email field only
    const emailValue = form.getValues("email");
    // Basic check using zod directly or trigger
    // Using trigger("email") might validate against the full schema if we don't be careful,
    // but since we conditionally set the resolver, it might be tricky.
    // Simplest is manual check here matching what sign-in does.
    // Note: signupSchema has name and password as required, so trigger() would fail on those if using full schema.

    // Manual email validation to match sign-in behavior
    // Although signupSchema.shape.email is ZodString, let's just use a new Zod check for simplicity and robustness
    const emailSchema = z.email();
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
    <SignupPageShell>
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
              showPasswordStep ? form.formState.isSubmitting : continueLoading
            }
            disabled={showPasswordStep ? false : form.watch("email") === ""}
            data-testid="submit-email-password-sign-up-form"
          >
            {showPasswordStep ? "Sign up" : "Continue"}
          </Button>
          {formError ? (
            <div className="text-destructive text-center text-sm font-medium">
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
      <SignupFooter />
    </SignupPageShell>
  );
}

function VerifiedSignupFlow({
  authProviders,
}: Pick<PageProps, "authProviders" | "emailVerificationRequired">) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const emailParam = router.query.email as string | undefined;

  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SignupPhase>("form");
  const [otpEmail, setOtpEmail] = useState<string>("");
  const [otpCode, setOtpCode] = useState<string>("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [lastUsedAuthMethod, setLastUsedAuthMethod] =
    useLocalStorage<NextAuthProvider | null>(
      "langfuse_last_used_auth_method",
      null,
    );

  const form = useForm({
    resolver: zodResolver(signupVerifyFormSchema),
    defaultValues: {
      name: "",
      email: emailParam ?? "",
    },
  });

  async function onVerifiedSubmit(
    values: z.infer<typeof signupVerifyFormSchema>,
  ) {
    try {
      setFormError(null);

      // Call signup-verify to create passwordless user
      const res = await fetch(
        `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth/signup-verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: values.email, name: values.name }),
        },
      );

      if (!res.ok) {
        const payload = (await res.json()) as { message: string };
        setFormError(payload.message);
        return;
      }

      // Send OTP email via NextAuth email provider
      const signInRes = await signIn("email", {
        email: values.email,
        callbackUrl: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/setup-password`,
        redirect: false,
      });

      if (signInRes?.error) {
        setFormError(
          signInRes.error === "AccessDenied"
            ? "Unable to send verification email. Please try again."
            : signInRes.error,
        );
        return;
      }

      capture("sign_up:button_click", { provider: "email_verification" });
      setOtpEmail(values.email);
      setPhase("otp");
    } catch {
      setFormError("An error occurred. Please try again.");
    }
  }

  function handleOtpVerify() {
    if (!otpCode || otpCode.length !== 6) return;
    setOtpLoading(true);
    setOtpError(null);

    const formattedEmail = encodeURIComponent(otpEmail.toLowerCase().trim());
    const formattedCode = encodeURIComponent(otpCode.trim());
    const callback = encodeURIComponent(
      `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/setup-password`,
    );
    window.location.href = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth/callback/email?email=${formattedEmail}&token=${formattedCode}&callbackUrl=${callback}`;
  }

  // OTP phase
  if (phase === "otp") {
    return (
      <>
        <Head>
          <title>Verify your email | Langfuse</title>
        </Head>
        <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <LangfuseIcon className="mx-auto" />
            <h2 className="text-primary mt-4 text-center text-2xl leading-9 font-bold tracking-tight">
              Check your email
            </h2>
            <p className="text-muted-foreground mt-2 text-center text-sm">
              We sent a verification code to{" "}
              <span className="font-medium">{otpEmail}</span>
            </p>
          </div>

          <div className="bg-background mt-14 px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-10">
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="otp-code"
                  className="mb-2 block text-sm font-medium"
                >
                  Verification code
                </label>
                <Input
                  id="otp-code"
                  type="number"
                  minLength={6}
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.trim())}
                  placeholder="6-digit code"
                  className="w-full"
                  autoFocus
                />
              </div>
              <Button
                onClick={handleOtpVerify}
                className="w-full"
                loading={otpLoading}
                disabled={!otpCode || otpCode.length !== 6}
              >
                Verify
              </Button>
              {otpError && (
                <div className="text-destructive text-center text-sm font-medium">
                  {otpError}
                </div>
              )}
              <p className="text-muted-foreground text-center text-xs">
                The code is valid for 3 minutes.{" "}
                <button
                  type="button"
                  className="text-primary-accent hover:text-hover-primary-accent font-medium"
                  onClick={() => {
                    setPhase("form");
                    setOtpCode("");
                    setOtpError(null);
                  }}
                >
                  Go back
                </button>
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Form phase
  return (
    <SignupPageShell>
      <Form {...form}>
        <form
          className="space-y-6"
          onSubmit={form.handleSubmit(onVerifiedSubmit)}
        >
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
          <Button
            type="submit"
            className="w-full"
            loading={form.formState.isSubmitting}
            data-testid="submit-email-password-sign-up-form"
          >
            Continue
          </Button>
          {formError ? (
            <div className="text-destructive text-center text-sm font-medium">
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
      <SignupFooter />
    </SignupPageShell>
  );
}

function SignupPageShell({ children }: { children: React.ReactNode }) {
  const { isLangfuseCloud } = useLangfuseCloudRegion();

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
          <h2 className="text-primary mt-4 text-center text-2xl leading-9 font-bold tracking-tight">
            Create new account
          </h2>
        </div>
        {isLangfuseCloud ? (
          <div className="text-center sm:mx-auto sm:w-full sm:max-w-[480px]">
            No credit card required.
          </div>
        ) : null}

        <CloudRegionSwitch isSignUpPage />

        <div className="bg-background mt-14 px-6 py-10 shadow-sm sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-10">
          {children}
        </div>
        <CloudPrivacyNotice action="creating an account" />
      </div>
    </>
  );
}

function SignupFooter() {
  const router = useRouter();
  return (
    <p className="text-muted-foreground mt-10 text-center text-sm">
      Already have an account?{" "}
      <Link
        href={`/auth/sign-in${router.asPath.includes("?") ? router.asPath.substring(router.asPath.indexOf("?")) : ""}`}
        className="text-primary-accent hover:text-hover-primary-accent leading-6 font-semibold"
      >
        Sign in
      </Link>
    </p>
  );
}
