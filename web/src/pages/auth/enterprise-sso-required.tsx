import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
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
import { captureUnknownError } from "@/src/utils/captureUnknownError";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/src/features/i18n/AuthLanguageSwitcher";

const createEnterpriseSsoFormSchema = (invalidEmail: string) =>
  z.object({ email: z.email({ error: invalidEmail }) });

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  "github-enterprise": "GitHub Enterprise",
  gitlab: "GitLab",
  "azure-ad": "Azure AD",
  okta: "Okta",
  authentik: "Authentik",
  onelogin: "OneLogin",
  auth0: "Auth0",
  cognito: "Cognito",
  keycloak: "Keycloak",
  workos: "WorkOS",
  wordpress: "WordPress",
};

export default function EnterpriseSsoRequiredPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailFromQuery =
    typeof router.query.email === "string" ? router.query.email : "";
  const attemptedProvider =
    typeof router.query.attemptedProvider === "string"
      ? router.query.attemptedProvider
      : undefined;
  const callbackUrl =
    typeof router.query.callbackUrl === "string"
      ? router.query.callbackUrl
      : undefined;

  const friendlyProviderName = useMemo(() => {
    if (!attemptedProvider) return undefined;
    if (attemptedProvider === "email") return t("enterpriseSso.providerEmail");
    if (attemptedProvider === "custom")
      return t("enterpriseSso.providerCustomOauth");
    return (
      PROVIDER_LABELS[attemptedProvider] ?? attemptedProvider.replace(/-/g, " ")
    );
  }, [attemptedProvider, t]);

  const enterpriseSsoFormSchema = createEnterpriseSsoFormSchema(
    t("common.invalidEmail"),
  );
  const form = useForm<z.infer<typeof enterpriseSsoFormSchema>>({
    resolver: zodResolver(enterpriseSsoFormSchema),
    defaultValues: {
      email: emailFromQuery,
    },
  });

  useEffect(() => {
    if (emailFromQuery) {
      form.setValue("email", emailFromQuery);
    }
  }, [emailFromQuery, form]);

  async function onSubmit(values: z.infer<typeof enterpriseSsoFormSchema>) {
    setError(null);
    setLoading(true);

    const domain = values.email.split("@")[1]?.toLowerCase();
    if (!domain) {
      form.setError("email", { message: t("common.invalidEmail") });
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth/check-sso`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        },
      );

      if (response.ok) {
        const { providerId } = (await response.json()) as {
          providerId: string;
        };
        await signIn(providerId, {
          callbackUrl,
        });
        return;
      }

      if (response.status === 404) {
        setError(t("enterpriseSso.notFound"));
        return;
      }

      setError(t("enterpriseSso.startFailed"));
    } catch (err) {
      captureUnknownError("auth.enterpriseSso", err);
      setError(t("enterpriseSso.checkFailed"));
    } finally {
      setLoading(false);
    }
  }

  const description = friendlyProviderName
    ? t("enterpriseSso.descriptionWithProvider", {
        provider: friendlyProviderName,
      })
    : t("enterpriseSso.description");

  return (
    <>
      <Head>
        <title>{t("enterpriseSso.pageTitle")} | Langfuse</title>
      </Head>
      <AuthLanguageSwitcher />
      <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="mx-auto w-fit">
            <LangfuseIcon />
          </div>
          <h1 className="text-primary mt-6 text-center text-2xl font-bold">
            {t("enterpriseSso.title")}
          </h1>
          <p className="text-muted-foreground mt-2 text-center text-sm leading-6">
            {description}
          </p>
        </div>

        <div className="border-border bg-card mt-10 rounded-lg border px-6 py-8 shadow-sm sm:mx-auto sm:w-full sm:max-w-md">
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
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
                loading={loading}
                disabled={loading}
              >
                {t("enterpriseSso.continue")}
              </Button>
            </form>
          </Form>
          {error ? (
            <div className="text-destructive mt-4 text-center text-sm font-bold">
              {error}
              <br />
              {t.rich("enterpriseSso.contactIfPersistent", {
                email: (chunks) => (
                  <a
                    href="mailto:support@langfuse.com"
                    className="text-link hover:text-link-hover"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </div>
          ) : null}
          <div className="text-muted-foreground mt-6 text-center text-sm">
            <Link
              href="/auth/sign-in"
              className="text-link hover:text-link-hover"
            >
              {t("enterpriseSso.back")}
            </Link>
          </div>
        </div>

        <div className="text-muted-foreground mt-4 text-center text-xs">
          {t.rich("enterpriseSso.needHelp", {
            email: (chunks) => (
              <a
                href="mailto:support@langfuse.com"
                className="text-link hover:text-link-hover"
              >
                {chunks}
              </a>
            ),
          })}
        </div>
      </div>
    </>
  );
}
