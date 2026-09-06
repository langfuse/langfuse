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
import {
  createNameSchema,
  createSignupSchema,
} from "@/src/features/auth/lib/signupSchema";
import {
  isSignupErrorCode,
  type SignupErrorCode,
} from "@/src/features/auth-credentials/lib/signupErrors";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { env } from "@/src/env.mjs";
import { useState } from "react";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { CloudPrivacyNotice } from "@/src/features/auth/components/AuthCloudPrivacyNotice";
import { CloudRegionSwitch } from "@/src/features/auth/components/AuthCloudRegionSwitch";
import {
  FALLBACK_AUTH_PROVIDERS,
  SSOButtons,
  useHuggingFaceRedirect,
  type PageProps,
} from "@/src/pages/auth/sign-in";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useRouter } from "next/router";
import { getSafeRedirectPath } from "@/src/utils/redirect";
import { captureUnknownError } from "@/src/utils/captureUnknownError";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/src/features/i18n/AuthLanguageSwitcher";

// Use the same getServerSideProps function as src/pages/auth/sign-in.tsx
export { getServerSideProps } from "@/src/pages/auth/sign-in";

type NextAuthProvider = NonNullable<Parameters<typeof signIn>[0]>;

// Schema for the verified signup flow (email + name only, no password)
const createSignupVerifyFormSchema = (
  invalidEmail: string,
  nameMessages: Parameters<typeof createNameSchema>[0],
) =>
  z.object({
    name: createNameSchema(nameMessages),
    email: z.email({ error: invalidEmail }),
  });

const signupErrorMessageKeys = {
  SIGNUP_DISABLED: "signUp.errors.signupDisabled",
  PASSWORD_SIGNUP_DISABLED: "signUp.errors.passwordSignupDisabled",
  DOMAIN_SSO_REQUIRED: "signUp.errors.domainSsoRequired",
  ENTERPRISE_SSO_REQUIRED: "signUp.errors.enterpriseSsoRequired",
  ACCOUNT_EXISTS: "signUp.errors.accountExists",
  IDENTITY_PROVIDER_ACCOUNT_EXISTS:
    "signUp.errors.identityProviderAccountExists",
  EMAIL_VERIFICATION_REQUIRED: "signUp.errors.emailVerificationRequired",
} as const satisfies Record<SignupErrorCode, string>;

async function getSignupErrorMessageKey(response: Response) {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      isSignupErrorCode(body.code)
    ) {
      return signupErrorMessageKeys[body.code];
    }
  } catch {
    // The generic message below also covers malformed and non-JSON responses.
  }

  return "signUp.failed" as const;
}

type SignupPhase = "form" | "otp";

export default function SignUp({
  authProviders = FALLBACK_AUTH_PROVIDERS,
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
  const t = useTranslations("auth");
  const { isLangfuseCloud } = useLangfuseCloudRegion();
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

  const signupSchema = createSignupSchema({
    invalidEmail: t("common.invalidEmail"),
    passwordMin: t("common.passwordMin"),
    passwordSecure: t("common.passwordSecure"),
    nameMaxLength: t("signUp.validation.nameMaxLength"),
    nameRequired: t("signUp.validation.nameRequired"),
    nameNoHtml: t("signUp.validation.nameNoHtml"),
    nameNoUrl: t("signUp.validation.nameNoUrl"),
    nameFormat: t("signUp.validation.nameFormat"),
  });
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
        message: t("common.invalidEmail"),
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

        signIn(providerId);
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
      captureUnknownError("auth.signUp.checkSso", error);
      setFormError(t("signIn.ssoCheckFailed"));
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
        setFormError(t(await getSignupErrorMessageKey(res)));
        return;
      }

      await signIn<"credentials">("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl:
          targetPath ??
          (isLangfuseCloud
            ? `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/onboarding`
            : `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/`),
      });
    } catch {
      setFormError(t("signUp.failed"));
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
                  handleContinue();
                }
          }
        >
          {showPasswordStep && (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.name")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("common.namePlaceholder")}
                      {...field}
                    />
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
                <FormLabel>{t("common.email")}</FormLabel>
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
                  <FormLabel>{t("common.password")}</FormLabel>
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
            {showPasswordStep ? t("signUp.submit") : t("common.continue")}
          </Button>
          {formError ? (
            <div className="text-destructive text-center text-sm font-bold">
              {formError}
            </div>
          ) : null}
        </form>
      </Form>
      <SSOButtons
        authProviders={authProviders}
        action={t("signUp.providerAction")}
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
  const t = useTranslations("auth");
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

  const signupVerifyFormSchema = createSignupVerifyFormSchema(
    t("common.invalidEmail"),
    {
      nameNoUrl: t("signUp.validation.nameNoUrl"),
      nameFormat: t("signUp.validation.nameFormat"),
      nameRequired: t("signUp.validation.nameRequired"),
      nameNoHtml: t("signUp.validation.nameNoHtml"),
      nameMaxLength: t("signUp.validation.nameMaxLength"),
    },
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
        setFormError(t(await getSignupErrorMessageKey(res)));
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
            ? t("signUp.verificationEmailFailed")
            : t("signUp.failed"),
        );
        return;
      }

      capture("sign_up:button_click", { provider: "email_verification" });
      setOtpEmail(values.email);
      setPhase("otp");
    } catch {
      setFormError(t("signUp.failed"));
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
    // Existing hard navigation is accepted during the Next.js 16.3 migration.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth/callback/email?email=${formattedEmail}&token=${formattedCode}&callbackUrl=${callback}`;
  }

  // OTP phase
  if (phase === "otp") {
    return (
      <>
        <Head>
          <title>{t("verification.pageTitle")} | Langfuse</title>
        </Head>
        <AuthLanguageSwitcher />
        <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="mx-auto w-fit">
              <LangfuseIcon />
            </div>
            <h2 className="text-primary mt-4 text-center text-2xl leading-9 font-bold tracking-tight">
              {t("verification.title")}
            </h2>
            <p className="text-muted-foreground mt-2 text-center text-sm">
              {t("verification.sentTo", { email: otpEmail })}
            </p>
          </div>

          <div className="bg-background mt-14 px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-10">
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="otp-code"
                  className="mb-2 block text-sm font-bold"
                >
                  {t("verification.code")}
                </label>
                <Input
                  id="otp-code"
                  type="number"
                  minLength={6}
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.trim())}
                  placeholder={t("verification.codePlaceholder")}
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
                {t("verification.verify")}
              </Button>
              {otpError && (
                <div className="text-destructive text-center text-sm font-bold">
                  {otpError}
                </div>
              )}
              <p className="text-muted-foreground text-center text-xs">
                {t("verification.expires")}{" "}
                <button
                  type="button"
                  className="text-link hover:text-link-hover font-bold"
                  onClick={() => {
                    setPhase("form");
                    setOtpCode("");
                    setOtpError(null);
                  }}
                >
                  {t("verification.goBack")}
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
                <FormLabel>{t("common.name")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("common.namePlaceholder")} {...field} />
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
                <FormLabel>{t("common.email")}</FormLabel>
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
            {t("common.continue")}
          </Button>
          {formError ? (
            <div className="text-destructive text-center text-sm font-bold">
              {formError}
            </div>
          ) : null}
        </form>
      </Form>
      <SSOButtons
        authProviders={authProviders}
        action={t("signUp.providerAction")}
        lastUsedMethod={lastUsedAuthMethod}
        onProviderSelect={setLastUsedAuthMethod}
      />
      <SignupFooter />
    </SignupPageShell>
  );
}

function SignupPageShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("auth");
  const { isLangfuseCloud } = useLangfuseCloudRegion();

  return (
    <>
      <Head>
        <title>{t("signUp.pageTitle")} | Langfuse</title>
        <meta
          name="description"
          content={t("signUp.metaDescription")}
          key="desc"
        />
      </Head>
      <AuthLanguageSwitcher />
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="mx-auto w-fit">
            <LangfuseIcon />
          </div>
          <h2 className="text-primary mt-4 text-center text-2xl leading-9 font-bold tracking-tight">
            {t("signUp.title")}
          </h2>
        </div>
        {isLangfuseCloud ? (
          <div className="text-center sm:mx-auto sm:w-full sm:max-w-[480px]">
            {t("signUp.noCreditCard")}
          </div>
        ) : null}

        <CloudRegionSwitch isSignUpPage />

        <div className="bg-background mt-14 px-6 py-10 shadow-sm sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-10">
          {children}
        </div>
        <CloudPrivacyNotice action={t("cloud.creatingAccount")} />
      </div>
    </>
  );
}

function SignupFooter() {
  const t = useTranslations("auth.signUp");
  const router = useRouter();
  return (
    <p className="text-muted-foreground mt-10 text-center text-sm">
      {t("alreadyHaveAccount")}{" "}
      <Link
        href={`/auth/sign-in${router.asPath.includes("?") ? router.asPath.substring(router.asPath.indexOf("?")) : ""}`}
        className="text-link hover:text-link-hover leading-6 font-bold"
      >
        {t("signIn")}
      </Link>
    </p>
  );
}
