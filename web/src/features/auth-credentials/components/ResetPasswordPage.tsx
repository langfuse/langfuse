import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Head from "next/head";
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
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { signIn, useSession } from "next-auth/react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { RequestResetPasswordEmailButton } from "@/src/features/auth-credentials/components/ResetPasswordButton";
import { TRPCClientError } from "@trpc/client";
import Link from "next/link";
import { ErrorPage } from "@/src/components/error-page";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { createPasswordSchema } from "@/src/features/auth/lib/signupSchema";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/src/features/i18n/AuthLanguageSwitcher";
import { PASSWORD_SETUP_EMAIL_STORAGE_KEY } from "@/src/features/auth-credentials/lib/credentialsUtils";

const createResetPasswordSchema = ({
  passwordMin,
  passwordSecure,
  invalidToken,
  passwordsMismatch,
}: {
  passwordMin: string;
  passwordSecure: string;
  invalidToken: string;
  passwordsMismatch: string;
}) => {
  const passwordSchema = createPasswordSchema({ passwordMin, passwordSecure });
  return z
    .object({
      token: z.string().regex(/^\d{6}$/, { message: invalidToken }),
      password: passwordSchema,
      confirmPassword: passwordSchema,
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: passwordsMismatch,
      path: ["confirmPassword"],
    });
};

export function ResetPasswordPage({
  passwordResetAvailable,
  initialEmail = "",
  intent = "reset",
}: {
  passwordResetAvailable: boolean;
  initialEmail?: string;
  intent?: "reset" | "setup";
}) {
  const t = useTranslations("auth");
  const session = useSession();
  const router = useRouter();
  const { isLangfuseCloud, region } = useLangfuseCloudRegion();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [codeRequested, setCodeRequested] = useState(
    intent === "setup" && Boolean(initialEmail),
  );

  const capture = usePostHogClientCapture();

  const isSetMode =
    intent === "setup" || session.data?.user?.hasPassword === false;

  const mutResetPassword = api.credentials.resetPassword.useMutation();
  const effectiveEmail = session.data?.user?.email ?? email;

  const resetPasswordSchema = createResetPasswordSchema({
    passwordMin: t("common.passwordMin"),
    passwordSecure: t("common.passwordSecure"),
    invalidToken: t("verification.codePlaceholder"),
    passwordsMismatch: t("passwordReset.passwordsMismatch"),
  });
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (intent !== "setup" || initialEmail) return;

    const storedEmail = sessionStorage.getItem(
      PASSWORD_SETUP_EMAIL_STORAGE_KEY,
    );
    if (storedEmail) {
      setEmail(storedEmail);
      setCodeRequested(true);
    }
  }, [initialEmail, intent]);

  async function onSubmit(values: z.infer<typeof resetPasswordSchema>) {
    setFormError(null);
    setIsSuccess(false);
    if (!z.email().safeParse(effectiveEmail).success) {
      setFormError(t("common.invalidEmail"));
      return;
    }
    capture(
      isSetMode
        ? "auth:set_password_form_submit"
        : "auth:update_password_form_submit",
    );
    try {
      await mutResetPassword.mutateAsync({
        email: effectiveEmail,
        token: values.token,
        password: values.password,
      });

      if (isSetMode) {
        sessionStorage.removeItem(PASSWORD_SETUP_EMAIL_STORAGE_KEY);
      }

      let target =
        isSetMode && isLangfuseCloud && region !== "DEV" ? "/onboarding" : "/";
      if (session.status !== "authenticated") {
        const signInResult = await signIn("credentials", {
          email: effectiveEmail,
          password: values.password,
          redirect: false,
        });
        if (!signInResult?.ok) {
          target = "/auth/sign-in";
        }
      }

      setIsSuccess(true);
      setTimeout(() => {
        router.push(target);
        setIsSuccess(false);
      }, 2000);
    } catch (error) {
      if (!(error instanceof TRPCClientError)) {
        console.error(error);
      }
      setFormError(t("passwordReset.unknownError"));
    }
  }

  if (!passwordResetAvailable)
    return (
      <>
        <AuthLanguageSwitcher />
        <ErrorPage
          title={t("passwordReset.notAvailable")}
          message={t("passwordReset.notConfigured")}
          signInLabel={t("signIn.submit")}
          additionalButton={{
            label: t("passwordReset.setupInstructions"),
            href: "https://langfuse.com/self-hosting/security/authentication-and-sso#auth-email-password",
          }}
        />
      </>
    );

  const title = isSetMode
    ? t("passwordReset.setTitle")
    : t("passwordReset.resetTitle");
  const pageTitle = isSetMode
    ? t("passwordReset.setPageTitle")
    : t("passwordReset.resetPageTitle");
  const submitLabel = isSetMode
    ? t("passwordReset.setSubmit")
    : t("passwordReset.updateSubmit");
  const successMessage = isSetMode
    ? t("passwordReset.setSuccess")
    : t("passwordReset.updateSuccess");

  return (
    <>
      <Head>
        <title>{pageTitle} | Langfuse</title>
      </Head>
      <AuthLanguageSwitcher />
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <Link href="/">
            <div className="mx-auto w-fit">
              <LangfuseIcon />
            </div>
          </Link>
          <h2 className="text-primary mt-4 text-center text-2xl leading-9 font-bold tracking-tight">
            {title}
          </h2>
          {!isSetMode && session.status !== "authenticated" && (
            <div className="mt-2 flex justify-center">
              <Button asChild variant="ghost">
                <Link href="/auth/sign-in">
                  <ArrowLeft className="mr-2 h-3 w-3" />
                  {t("common.backToSignIn")}
                </Link>
              </Button>
            </div>
          )}
        </div>

        <div className="bg-background mt-10 px-6 py-10 shadow-sm sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-12">
          <div className="space-y-6">
            <Form {...form}>
              <form
                className="space-y-6"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <FormItem>
                  <FormLabel>{t("common.email")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="jsdoe@example.com"
                      disabled={session.status === "authenticated"}
                      allowPasswordManager
                      autoComplete="email"
                      value={effectiveEmail}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </FormControl>
                </FormItem>
                {codeRequested ? (
                  <>
                    <p className="text-muted-foreground text-sm">
                      {t("verification.inbox")} {t("verification.expires")}
                    </p>
                    <FormField
                      control={form.control}
                      name="token"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("verification.code")}</FormLabel>
                          <FormControl>
                            <Input
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                              placeholder={t("verification.codePlaceholder")}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {isSetMode
                              ? t("common.password")
                              : t("passwordReset.newPassword")}
                          </FormLabel>
                          <FormControl>
                            <PasswordInput
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {isSetMode
                              ? t("passwordReset.confirmPassword")
                              : t("passwordReset.confirmNewPassword")}
                          </FormLabel>
                          <FormControl>
                            <PasswordInput
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="pt-4">
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={mutResetPassword.isPending}
                        loading={mutResetPassword.isPending}
                      >
                        {submitLabel}
                      </Button>
                    </div>
                    <RequestResetPasswordEmailButton
                      email={effectiveEmail}
                      callbackUrl={
                        isSetMode ? "/auth/setup-password" : undefined
                      }
                      onEmailSent={() => setCodeRequested(true)}
                      label={t("passwordReset.request")}
                    />
                  </>
                ) : (
                  <RequestResetPasswordEmailButton
                    email={effectiveEmail}
                    callbackUrl={isSetMode ? "/auth/setup-password" : undefined}
                    onEmailSent={() => setCodeRequested(true)}
                  />
                )}
              </form>
            </Form>
            {formError ? (
              <div className="text-destructive text-center text-sm font-bold">
                {formError}
              </div>
            ) : null}
            {isSuccess && (
              <div className="text-center text-sm font-bold">
                {successMessage}
              </div>
            )}
          </div>
        </div>
        {!isSetMode && session.status !== "authenticated" && (
          <div className="text-muted-foreground mx-auto mt-10 max-w-lg text-center text-xs">
            {t.rich("passwordReset.deliveryNotice", {
              signIn: (chunks) => (
                <Link href="/auth/sign-in" className="underline">
                  {chunks}
                </Link>
              ),
            })}
          </div>
        )}
      </div>
    </>
  );
}
