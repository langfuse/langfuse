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
import { createSignupSchema } from "@/src/features/auth/lib/signupSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useForm } from "react-hook-form";
import type * as z from "zod/v4";
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
import { Divider } from "@tremor/react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useTranslation } from "next-i18next";

// Use the same getServerSideProps function as src/pages/auth/sign-in.tsx
export { getServerSideProps } from "@/src/pages/auth/sign-in";

export default function SignIn({
  authProviders,
  runningOnHuggingFaceSpaces,
}: PageProps) {
  const { t } = useTranslation("common");
  useHuggingFaceRedirect(runningOnHuggingFaceSpaces);
  const [turnstileToken, setTurnstileToken] = useState<string>();
  // Used to refresh turnstile as the token can only be used once
  const [turnstileCData, setTurnstileCData] = useState<string>(
    new Date().getTime().toString(),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const signupSchema = createSignupSchema(t);

  const form = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof signupSchema>) {
    try {
      setFormError(null);
      const res = await fetch(
        `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth/signup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "DEV"
            ? `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/onboarding`
            : `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/`,
        turnstileToken,
      });
    } catch (err) {
      setFormError(t("auth.anErrorOccurred"));
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
        <title>{t("auth.signUp")} | Langfuse</title>
        <meta
          name="description"
          content={
            t("auth.createNewAccount") + ", " + t("auth.noCreditCardRequired")
          }
          key="desc"
        />
      </Head>
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon className="mx-auto" />
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-primary">
            {t("auth.createNewAccount")}
          </h2>
        </div>
        {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined ? (
          <div className="text-center sm:mx-auto sm:w-full sm:max-w-[480px]">
            {t("auth.noCreditCardRequired")}
          </div>
        ) : null}
        <CloudRegionSwitch isSignUpPage />
        <div className="mt-14 bg-background px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-10">
          <Form {...form}>
            <form
              className="space-y-6" // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.name")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("auth.namePlaceholder")}
                        {...field}
                      />
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
                    <FormLabel>{t("auth.email")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("auth.emailPlaceholder")}
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
                    <FormLabel>{t("auth.password")}</FormLabel>
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
                loading={form.formState.isSubmitting}
                disabled={
                  env.NEXT_PUBLIC_TURNSTILE_SITE_KEY !== undefined &&
                  turnstileToken === undefined
                }
                data-testid="submit-email-password-sign-up-form"
              >
                {t("auth.signUp")}
              </Button>
              {formError ? (
                <div className="text-center text-sm font-medium text-destructive">
                  {formError}
                </div>
              ) : null}
            </form>
          </Form>
          <SSOButtons authProviders={authProviders} action={t("auth.signUp")} />
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
          <p className="mt-10 text-center text-sm text-muted-foreground">
            {t("auth.alreadyHaveAccount")}{" "}
            <Link
              href="/auth/sign-in"
              className="font-semibold leading-6 text-primary-accent hover:text-hover-primary-accent"
            >
              {t("auth.signIn")}
            </Link>
          </p>
        </div>
        <CloudPrivacyNotice actionKey="auth.creatingAnAccount" />
      </div>
    </>
  );
}
